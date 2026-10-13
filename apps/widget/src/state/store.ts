import type { AuthStatus, AuthTokens, Conversation, CurrentUser, Message } from '../types';

export interface WidgetState {
  authStatus: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  me: CurrentUser | null;
  authError: string | null;

  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  theme: 'light' | 'dark';

  conversations: Conversation[];
  activeConversationId: number | null;
  messagesByConversation: Record<number, Message[]>;
  typingByConversation: Record<number, Set<number>>;
  onlineUsers: Set<number>;

  historyCursorByConversation: Record<number, string | null>;
  historyHasMoreByConversation: Record<number, boolean>;
  historyLoadingByConversation: Record<number, boolean>;
  unreadByConversation: Record<number, number>;

  /** Message IDs I sent that the recipient has marked as read. */
  readMessageIds: Set<number>;
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
  historyLoadingByConversation: {},
  unreadByConversation: {},
  readMessageIds: new Set(),
};

class Store {
  private state: WidgetState = { ...initialState };
  private listeners = new Set<Listener>();

  get(): WidgetState { return this.state; }

  set(patch: Partial<WidgetState> | ((s: WidgetState) => Partial<WidgetState>)): void {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resetConversationState(): void {
    this.set({
      conversations: [],
      activeConversationId: null,
      messagesByConversation: {},
      typingByConversation: {},
      onlineUsers: new Set(),
      historyCursorByConversation: {},
      historyHasMoreByConversation: {},
      historyLoadingByConversation: {},
      unreadByConversation: {},
      readMessageIds: new Set(),
      isLoading: false,
      error: null,
    });
  }

  reset(): void {
    this.state = { ...initialState, onlineUsers: new Set(), readMessageIds: new Set() };
    this.listeners.forEach((l) => l(this.state));
  }

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

  addMessage(msg: Message): void {
    this.set((s) => {
      const list = s.messagesByConversation[msg.conversationId] ?? [];
      if (list.some((m) => m.id === msg.id)) return {};
      const next = [...list, msg].sort((a, b) => a.id - b.id);

      const unread = { ...s.unreadByConversation };
      const isActive = s.activeConversationId === msg.conversationId;
      const isMine = s.me?.id === msg.senderId;
      if (!isActive && !isMine) {
        unread[msg.conversationId] = (unread[msg.conversationId] ?? 0) + 1;
      }

      return {
        messagesByConversation: { ...s.messagesByConversation, [msg.conversationId]: next },
        unreadByConversation: unread,
      };
    });
  }

  prependMessages(conversationId: number, msgs: Message[]): void {
    this.set((s) => {
      const existing = s.messagesByConversation[conversationId] ?? [];
      const known = new Set(existing.map((m) => m.id));
      const merged = [...msgs.filter((m) => !known.has(m.id)), ...existing].sort((a, b) => a.id - b.id);
      return { messagesByConversation: { ...s.messagesByConversation, [conversationId]: merged } };
    });
  }

  setMessages(conversationId: number, msgs: Message[]): void {
    this.set((s) => ({
      messagesByConversation: { ...s.messagesByConversation, [conversationId]: [...msgs].sort((a, b) => a.id - b.id) },
    }));
  }

  updateMessage(conversationId: number, msg: Message): void {
    this.set((s) => {
      const list = s.messagesByConversation[conversationId] ?? [];
      const next = list.map((m) => (m.id === msg.id ? { ...m, ...msg } : m));
      return { messagesByConversation: { ...s.messagesByConversation, [conversationId]: next } };
    });
  }

  setTyping(conversationId: number, userId: number, isTyping: boolean): void {
    this.set((s) => {
      const set = new Set(s.typingByConversation[conversationId] ?? []);
      if (isTyping) set.add(userId); else set.delete(userId);
      return { typingByConversation: { ...s.typingByConversation, [conversationId]: set } };
    });
  }

  setOnline(userId: number, online: boolean): void {
    this.set((s) => {
      const next = new Set(s.onlineUsers);
      if (online) next.add(userId); else next.delete(userId);
      return { onlineUsers: next };
    });
  }

  clearUnread(conversationId: number): void {
    this.set((s) => {
      const unread = { ...s.unreadByConversation };
      delete unread[conversationId];
      return { unreadByConversation: unread };
    });
  }

  /** Mark a list of message IDs as read by the recipient. */
  markMessagesRead(ids: number[]): void {
    if (ids.length === 0) return;
    this.set((s) => {
      const next = new Set(s.readMessageIds);
      for (const id of ids) next.add(id);
      return { readMessageIds: next };
    });
  }
}

export const store = new Store();