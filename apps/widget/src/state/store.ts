import type {
  AuthStatus,
  AuthTokens,
  Conversation,
  CurrentUser,
  Message,
} from '../types';

export interface WidgetState {
  // auth
  authStatus: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  me: CurrentUser | null;
  authError: string | null;

  // ui
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  theme: 'light' | 'dark';

  // data
  conversations: Conversation[];
  activeConversationId: number | null;
  messagesByConversation: Record<number, Message[]>;
  typingByConversation: Record<number, Set<number>>;
  onlineUsers: Set<number>;

  // pagination
  historyCursorByConversation: Record<number, string | null>;
  historyHasMoreByConversation: Record<number, boolean>;
  historyLoadedByConversation: Record<number, boolean>;
}

type Listener = (state: WidgetState) => void;

const initialState: WidgetState = {
  authStatus: 'idle',
  accessToken: null,
  refreshToken: null,
  me: null,
  authError: null,

  isOpen: false,
  isLoading: false,
  error: null,
  theme: 'light',

  conversations: [],
  activeConversationId: null,
  messagesByConversation: {},
  typingByConversation: {},
  onlineUsers: new Set(),

  historyCursorByConversation: {},
  historyHasMoreByConversation: {},
  historyLoadedByConversation: {},
};

class Store {
  private state: WidgetState = { ...initialState };
  private listeners = new Set<Listener>();

  get(): WidgetState {
    return this.state;
  }

  set(patch: Partial<WidgetState> | ((s: WidgetState) => Partial<WidgetState>)): void {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.state = { ...initialState, onlineUsers: new Set() };
    this.listeners.forEach((l) => l(this.state));
  }

  // ---- Auth helpers ----
  setAuth(tokens: AuthTokens): void {
    this.set({
      authStatus: 'authenticated',
      authError: null,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      me: tokens.user,
    });
  }

  setNeedsAuth(reason?: string): void {
    this.set({
      authStatus: 'needs-auth',
      authError: reason ?? null,
      accessToken: null,
      refreshToken: null,
      me: null,
    });
  }

  // ---- Conversations ----
  upsertConversation(conv: Conversation): void {
    this.set((s) => {
      const existing = s.conversations.findIndex((c) => c.id === conv.id);
      const conversations =
        existing === -1
          ? [conv, ...s.conversations]
          : s.conversations.map((c) => (c.id === conv.id ? { ...c, ...conv } : c));
      conversations.sort((a, b) => {
        const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
        const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
        return bt - at;
      });
      return { conversations };
    });
  }

  // ---- Messages ----
  addMessage(msg: Message): void {
    this.set((s) => {
      const list = s.messagesByConversation[msg.conversationId] ?? [];
      if (list.some((m) => m.id === msg.id)) return {};
      const next = [...list, msg].sort((a, b) => a.id - b.id);
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [msg.conversationId]: next,
        },
      };
    });
  }

  prependMessages(conversationId: number, msgs: Message[]): void {
    this.set((s) => {
      const existing = s.messagesByConversation[conversationId] ?? [];
      const known = new Set(existing.map((m) => m.id));
      const merged = [...msgs.filter((m) => !known.has(m.id)), ...existing].sort(
        (a, b) => a.id - b.id,
      );
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: merged,
        },
      };
    });
  }

  updateMessage(conversationId: number, msg: Message): void {
    this.set((s) => {
      const list = s.messagesByConversation[conversationId] ?? [];
      const next = list.map((m) => (m.id === msg.id ? { ...m, ...msg } : m));
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: next,
        },
      };
    });
  }

  setTyping(conversationId: number, userId: number, isTyping: boolean): void {
    this.set((s) => {
      const set = new Set(s.typingByConversation[conversationId] ?? []);
      if (isTyping) set.add(userId);
      else set.delete(userId);
      return {
        typingByConversation: {
          ...s.typingByConversation,
          [conversationId]: set,
        },
      };
    });
  }

  setOnline(userId: number, online: boolean): void {
    this.set((s) => {
      const next = new Set(s.onlineUsers);
      if (online) next.add(userId);
      else next.delete(userId);
      return { onlineUsers: next };
    });
  }
}

export const store = new Store();
