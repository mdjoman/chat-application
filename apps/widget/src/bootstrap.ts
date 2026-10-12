import { ApiClient } from './services/api-client';
import { SocketClient } from './services/socket-client';
import { bus } from './services/event-bus';
import { store } from './state/store';
import { sessionStore } from './services/session-store';
import { notifications } from './services/notification-service';
import { mountWidget } from './ui/root';
import type { ChatWidgetConfig, WidgetEvent } from './types';

const DEFAULT_FEATURES = {
  chat: true,
  groupChat: true,
  audioCall: false,
  videoCall: false,
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
  } catch { return `w_${Math.random().toString(36).slice(2)}`; }
}
function extractResetTokenFromUrl(): string | undefined {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('reset') ?? undefined;
  } catch { return undefined; }
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

    // Ensure we have up-to-date "me" (with avatar)
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
    if (!config?.apiBaseUrl) throw new Error('[ChatWidget] apiBaseUrl is required');

    const api = new ApiClient(deriveApiBase(config));
    const socket = new SocketClient(deriveSocketBase(config));
    const initialResetToken = extractResetTokenFromUrl();

    const rt: Runtime = { api, socket, config, mounted: false, initialResetToken };
    runtime = rt;

    await notifications.init();

    // DO NOT reset store here — we may already have a session to reuse.
    store.set({ isLoading: true, authStatus: 'authenticating', error: null });

    // 1. Try session-based auto-login first
    const stored = await sessionStore.load(config.appId);
    if (stored && !initialResetToken) {
      // Seed enough state for the refresh call to succeed
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
      // Token invalid — clear and continue to fresh login
      sessionStore.clear(config.appId);
      store.set({ refreshToken: null, me: null });
    }

    // 2. Widget-token exchange
    if (config.token) {
      try {
        const tokens = await api.exchangeWidgetToken(config.token, getOrCreateDeviceId());
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
      store.setNeedsAuth(initialResetToken ? 'Reset your password' : 'No token provided');
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

  open(): void { store.set({ isOpen: true }); },
  close(): void { store.set({ isOpen: false }); },
  minimize(): void { store.set({ isOpen: false }); },

  destroy(): void {
    runtime?.socket.disconnect();
    runtime?.host?.remove();
    if (runtime) sessionStore.clear(runtime.config.appId);
    runtime = null;
    store.reset();
    bus.clear();
  },

  /**
   * Explicit logout: revoke session on server, clear local, show login screen.
   */
  async logout(): Promise<void> {
    if (!runtime) return;

    // Best-effort server-side logout
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
      /* ignore */
    }

    // Clear local session but KEEP the widget mounted
    sessionStore.clear(runtime.config.appId);
    runtime.socket.disconnect();
    store.reset();
    store.set({
      isOpen: true,
      authStatus: 'needs-auth',
      authError: null,
    });
    bus.emit('needsAuth', {});
  },

  openConversation(conversationId: number): void {
    store.set({ isOpen: true, activeConversationId: conversationId });
  },

  async requestNotificationPermission(): Promise<boolean> {
    return notifications.requestPermission();
  },

  startAudioCall(_userId: number): void { /* Phase 7 */ },
  startVideoCall(_userId: number): void { /* Phase 8 */ },

  on(event: WidgetEvent, cb: (payload?: unknown) => void): void { bus.on(event, cb); },
};
