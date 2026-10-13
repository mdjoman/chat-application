import { ApiClient } from './services/api-client';
import { SocketClient } from './services/socket-client';
import { CallController } from './services/call-controller';
import { bus } from './services/event-bus';
import { store } from './state/store';
import { sessionStore } from './services/session-store';
import { notifications } from './services/notification-service';
import { mountWidget } from './ui/root';

import type { ChatWidgetConfig, WidgetEvent } from './types';

const DEFAULT_FEATURES = {
  chat: true,
  groupChat: true,
  audioCall: true,
  videoCall: true,
  groupCall: false,
  fileUpload: true,
  voiceMessage: true,
  screenShare: false,
  messageReaction: true,
  messageReply: true,
  messageForward: true,
  messageEdit: true,
  messageDelete: true,
  messagePin: true,
};

interface Runtime {
  api: ApiClient;
  socket: SocketClient;
  call: CallController;
  host?: HTMLElement;
  config: ChatWidgetConfig;
  mounted: boolean;
  initialResetToken?: string;
}

let runtime: Runtime | null = null;

function deriveApiBase(config: ChatWidgetConfig): string {
  return `${config.apiBaseUrl.replace(/\/$/, '')}/api/v1`;
}

function deriveSocketBase(config: ChatWidgetConfig): string {
  return config.apiBaseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}

function getOrCreateDeviceId(): string {
  const KEY = 'chat_widget_device_id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `w_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `w_${Math.random().toString(36).slice(2)}`;
  }
}

function extractResetTokenFromUrl(): string | undefined {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('reset') ?? undefined;
  } catch {
    return undefined;
  }
}

async function persistSession(rt: Runtime): Promise<void> {
  const s = store.get();
  if (!s.refreshToken || !s.me) return;

  await sessionStore.save({
    appId: rt.config.appId,
    origin: location.origin,
    refreshToken: s.refreshToken,
    user: {
      id: s.me.id,
      tenantId: s.me.tenantId,
      username: s.me.username,
      displayName: s.me.displayName,
      email: s.me.email,
      avatarUrl: s.me.avatarUrl,
    },
  });
}

async function postAuthSetup(rt: Runtime): Promise<void> {
  store.set({ isLoading: true, error: null });

  try {
    const prefs = await rt.api.getNotificationPrefs();
    if (prefs) notifications.setPrefs(prefs);

    // Ensure `me` is fresh (includes avatarUrl).
    const me = await rt.api.me();
    store.set({ me });

    const conversations = await rt.api.listConversations();
    store.set({ conversations, isLoading: false });

    rt.socket.connect();

    await mountShell(rt);

    bus.emit('ready', { user: store.get().me });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.set({ isLoading: false, error: message });
    bus.emit('error', { message });
    throw err;
  }
}

async function mountShell(rt: Runtime): Promise<void> {
  if (rt.mounted) return;

  const { host } = mountWidget({
    api: rt.api,
    socket: rt.socket,
    call: rt.call,
    primaryColor: rt.config.primaryColor ?? '#EC4899',
    position: rt.config.position ?? 'bottom-right',
    theme: rt.config.theme ?? 'auto',
    tenantSlug: rt.config.tenantSlug ?? 'default',
    initialResetToken: rt.initialResetToken,
    onAuthed: async () => {
      await persistSession(rt);
      await postAuthSetup(rt);
    },
    onLogout: () => {
      void ChatWidget.logout();
    },
  });

  rt.host = host;
  rt.mounted = true;
}

export const ChatWidget = {
  async init(config: ChatWidgetConfig): Promise<void> {
    if (!config?.apiBaseUrl) {
      throw new Error('[ChatWidget] apiBaseUrl is required');
    }

    const features = { ...DEFAULT_FEATURES, ...(config.features ?? {}) };
    void features;

    const api = new ApiClient(deriveApiBase(config));
    const socket = new SocketClient(deriveSocketBase(config));
    const call = new CallController(api, socket);
    const initialResetToken = extractResetTokenFromUrl();

    const rt: Runtime = {
      api,
      socket,
      call,
      config,
      mounted: false,
      initialResetToken,
    };
    runtime = rt;

    await notifications.init();

    // Do NOT reset the store here — we may have a stored session.
    store.set({ isLoading: true, authStatus: 'authenticating', error: null });

    // ---------------------------------------------------------------
    // 1. Session-based auto-login (refresh token in localStorage)
    // ---------------------------------------------------------------
    const stored = await sessionStore.load(config.appId);
    if (stored && !initialResetToken) {
      store.set({
        refreshToken: stored.refreshToken,
        me: {
          id: stored.user.id,
          tenantId: stored.user.tenantId,
          username: stored.user.username,
          displayName: stored.user.displayName,
          email: stored.user.email,
          avatarUrl: stored.user.avatarUrl,
          role: 'user',
        },
      });

      const ok = await api.refreshTokens();
      if (ok) {
        bus.emit('authenticated', { user: store.get().me });
        await postAuthSetup(rt);
        return;
      }

      // Session invalid — clear it and try the next strategy.
      sessionStore.clear(config.appId);
      store.set({ refreshToken: null, me: null });
    }

    // ---------------------------------------------------------------
    // 2. Credentials-based auto-login (config.autoLogin)
    // ---------------------------------------------------------------
    if (
      !config.token &&
      config.autoLogin?.username &&
      config.autoLogin.password
    ) {
      try {
        const deviceId = getOrCreateDeviceId();
        const tokens = await api.login({
          tenantSlug: config.tenantSlug ?? 'default',
          identifier: config.autoLogin.username,
          password: config.autoLogin.password,
          deviceId,
        });
        store.setAuth(tokens);
        bus.emit('authenticated', { user: tokens.user });
        await persistSession(rt);
        await postAuthSetup(rt);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn('[ChatWidget] auto-login failed, falling back to form', msg);
        // Fall through to widget-token / login-form handling.
      }
    }

    // ---------------------------------------------------------------
    // 3. Widget-token exchange
    // ---------------------------------------------------------------
    if (config.token) {
      try {
        const tokens = await api.exchangeWidgetToken(
          config.token,
          getOrCreateDeviceId(),
        );
        store.setAuth(tokens);
        bus.emit('authenticated', { user: tokens.user });
        await persistSession(rt);
        await postAuthSetup(rt);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (config.allowLogin === false) {
          store.set({ isLoading: false, authStatus: 'idle', error: msg });
          bus.emit('error', { message: msg });
          throw err;
        }

        store.setNeedsAuth(msg);
      }
    } else if (config.allowLogin !== false) {
      store.setNeedsAuth(
        initialResetToken ? 'Reset your password' : 'No token provided',
      );
    } else {
      const msg = 'No widget token provided and login fallback is disabled';
      store.set({ isLoading: false, authStatus: 'idle', error: msg });
      bus.emit('error', { message: msg });
      throw new Error(msg);
    }

    await mountShell(rt);
    store.set({ isLoading: false });
    bus.emit('needsAuth', {});
  },

  // ---------------------------------------------------------------
  // Widget visibility
  // ---------------------------------------------------------------
  open(): void {
    store.set({ isOpen: true });
  },
  close(): void {
    store.set({ isOpen: false });
  },
  minimize(): void {
    store.set({ isOpen: false });
  },

  // ---------------------------------------------------------------
  // Destroy
  // ---------------------------------------------------------------
  destroy(): void {
    runtime?.socket.disconnect();
    runtime?.host?.remove();

    if (runtime) {
      sessionStore.clear(runtime.config.appId);
    }

    runtime = null;
    store.reset();
    bus.clear();
  },

  // ---------------------------------------------------------------
  // Logout (keeps the widget mounted and shows the login screen)
  // ---------------------------------------------------------------
  async logout(): Promise<void> {
    if (!runtime) return;

    try {
      const refreshToken = store.get().refreshToken;
      const accessToken = store.get().accessToken;
      if (accessToken) {
        await fetch(`${runtime.api.baseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      /* ignore network errors */
    }

    sessionStore.clear(runtime.config.appId);
    runtime.socket.disconnect();
    store.reset();
    store.set({ isOpen: true, authStatus: 'needs-auth', authError: null });
    bus.emit('needsAuth', {});
  },

  // ---------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------
  openConversation(conversationId: number): void {
    store.set({ isOpen: true, activeConversationId: conversationId });
  },

  // ---------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------
  async requestNotificationPermission(): Promise<boolean> {
    return notifications.requestPermission();
  },

  // ---------------------------------------------------------------
  // Call helpers
  // ---------------------------------------------------------------
  async startAudioCall(conversationId: number): Promise<void> {
    if (!runtime) return;
    try {
      await runtime.call.startOutgoing(conversationId, 'audio');
    } catch (err) {
      bus.emit('error', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async startVideoCall(conversationId: number): Promise<void> {
    if (!runtime) return;
    try {
      await runtime.call.startOutgoing(conversationId, 'video');
    } catch (err) {
      bus.emit('error', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },

  // ---------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------
  on(event: WidgetEvent, cb: (payload?: unknown) => void): void {
    bus.on(event, cb);
  },
};