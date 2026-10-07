import { ApiClient } from './services/api-client';
import { SocketClient } from './services/socket-client';
import { bus } from './services/event-bus';
import { store } from './state/store';
import { mountWidget } from './ui/root';
import type { ChatWidgetConfig, WidgetEvent } from './types';

const DEFAULT_FEATURES = {
  chat: true,
  groupChat: true,
  audioCall: false,
  videoCall: false,
  groupCall: false,
  fileUpload: false,
  voiceMessage: false,
  screenShare: false,
  messageReaction: true,
  messageReply: true,
  messageForward: false,
  messageEdit: false,
  messageDelete: true,
};

interface Runtime {
  api: ApiClient;
  socket: SocketClient;
  host?: HTMLElement;
  config: ChatWidgetConfig;
  mounted: boolean;
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

/**
 * After tokens exist (either via widget-token exchange or login),
 * load conversations, connect the socket and mount the UI.
 */
async function postAuthSetup(rt: Runtime): Promise<void> {
  store.set({ isLoading: true, error: null });

  try {
    const conversations = await rt.api.listConversations();
    store.set({ conversations, isLoading: false });

    rt.socket.connect();

    if (!rt.mounted) {
      const { host } = mountWidget({
        api: rt.api,
        socket: rt.socket,
        primaryColor: rt.config.primaryColor ?? '#6366f1',
        position: rt.config.position ?? 'bottom-right',
        theme: rt.config.theme ?? 'auto',
        tenantSlug: rt.config.tenantSlug ?? 'default',
        onAuthed: async () => {
          // Called from LoginScreen after successful sign-in.
          await postAuthSetup(rt);
        },
      });
      rt.host = host;
      rt.mounted = true;
    }

    bus.emit('ready', { user: store.get().me });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.set({ isLoading: false, error: message });
    bus.emit('error', { message });
    throw err;
  }
}

export const ChatWidget = {
  async init(config: ChatWidgetConfig): Promise<void> {
    if (!config?.apiBaseUrl) {
      throw new Error('[ChatWidget] apiBaseUrl is required');
    }

    const features = { ...DEFAULT_FEATURES, ...(config.features ?? {}) };
    const api = new ApiClient(deriveApiBase(config));
    const socket = new SocketClient(deriveSocketBase(config));

    const rt: Runtime = {
      api,
      socket,
      config,
      mounted: false,
    };
    runtime = rt;

    store.set({ isLoading: true, authStatus: 'authenticating', error: null });

    // Try widget-token exchange if a token was provided.
    if (config.token) {
      try {
        const tokens = await api.exchangeWidgetToken(config.token, getOrCreateDeviceId());
        store.setAuth(tokens);
        bus.emit('authenticated', { user: tokens.user });
        await postAuthSetup(rt);
        void features;
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (config.allowLogin === false) {
          // Caller explicitly forbade the login fallback → surface the error.
          store.set({ isLoading: false, authStatus: 'idle', error: msg });
          bus.emit('error', { message: msg });
          throw err;
        }
        // Otherwise fall through to login UI.
        store.setNeedsAuth(msg);
      }
    } else if (config.allowLogin !== false) {
      // No token provided at all but login is allowed.
      store.setNeedsAuth('No token provided');
    } else {
      const msg = 'No widget token provided and login fallback is disabled';
      store.set({ isLoading: false, authStatus: 'idle', error: msg });
      bus.emit('error', { message: msg });
      throw new Error(msg);
    }

    // Mount the widget immediately so the login form can render.
    if (!rt.mounted) {
      const { host } = mountWidget({
        api: rt.api,
        socket: rt.socket,
        primaryColor: rt.config.primaryColor ?? '#6366f1',
        position: rt.config.position ?? 'bottom-right',
        theme: rt.config.theme ?? 'auto',
        tenantSlug: rt.config.tenantSlug ?? 'default',
        onAuthed: async () => {
          await postAuthSetup(rt);
        },
      });
      rt.host = host;
      rt.mounted = true;
    }

    store.set({ isLoading: false });
    bus.emit('needsAuth', {});
  },

  open(): void {
    store.set({ isOpen: true });
  },

  close(): void {
    store.set({ isOpen: false });
  },

  minimize(): void {
    store.set({ isOpen: false });
  },

  destroy(): void {
    runtime?.socket.disconnect();
    runtime?.host?.remove();
    runtime = null;
    store.reset();
    bus.clear();
  },

  openConversation(conversationId: number): void {
    store.set({ isOpen: true, activeConversationId: conversationId });
  },

  startAudioCall(_userId: number): void {
    /* Phase 7 */
  },

  startVideoCall(_userId: number): void {
    /* Phase 8 */
  },

  logout(): void {
    ChatWidget.destroy();
  },

  on(event: WidgetEvent, cb: (payload?: unknown) => void): void {
    bus.on(event, cb);
  },
};
