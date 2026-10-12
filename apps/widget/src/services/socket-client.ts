import { io, type Socket } from 'socket.io-client';
import { store } from '../state/store';
import { bus } from './event-bus';
import { notifications } from './notification-service';
import type { Conversation, Message } from '../types';

export class SocketClient {
  private _socket: Socket | null = null;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/api\/v1\/?$/, '');
  }

  get socket(): Socket | null { return this._socket; }

  connect(): void {
    const token = store.get().accessToken;
    if (!token) throw new Error('No access token');

    this._socket = io(this.baseUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: { token, deviceId: this.getDeviceId() },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      reconnectionAttempts: Infinity,
    });

    this._socket.on('connect', () => {
      const convs = store.get().conversations;
      for (const c of convs) this._socket!.emit('conversation:join', { conversationId: c.id });
    });

    this._socket.on('connect_error', async (err) => {
      if (String(err?.message || '').toUpperCase().includes('UNAUTHORIZED')) {
        const { ApiClient } = await import('./api-client');
        const baseApi = `${this.baseUrl.replace(/\/$/, '')}/api/v1`;
        const api = new ApiClient(baseApi);
        const ok = await api.refreshTokens();
        if (ok) this._socket!.auth = { token: store.get().accessToken };
      }
    });

    this.bindEvents();
  }

  disconnect(): void {
    this._socket?.disconnect();
    this._socket = null;
  }

  joinConversation(conversationId: number): void {
    this._socket?.emit('conversation:join', { conversationId });
  }

  sendMessage(input: {
    conversationId: number;
    content: string;
    type?: Message['type'];
    replyToId?: number | null;
    clientId?: string;
    attachmentIds?: number[];
  }, ack?: (res: { ok?: boolean; message?: Message; error?: string }) => void): void {
    this._socket?.emit('message:send', input, ack);
  }

  editMessage(messageId: number, content: string): void {
    this._socket?.emit('message:edit', { messageId, content });
  }

  deleteMessage(messageId: number): void {
    this._socket?.emit('message:delete', { messageId });
  }

  startTyping(conversationId: number): void {
    this._socket?.emit('typing:start', { conversationId });
  }

  stopTyping(conversationId: number): void {
    this._socket?.emit('typing:stop', { conversationId });
  }

  markRead(conversationId: number, messageIds: number[]): void {
    this._socket?.emit('message:read', { conversationId, messageIds });
  }

  react(messageId: number, reaction: string, added: boolean): void {
    this._socket?.emit('message:react', { messageId, reaction, added });
  }

  private bindEvents(): void {
    if (!this._socket) return;

    this._socket.on('message:new', (msg: Message) => {
      store.addMessage(msg);
      const me = store.get().me;
      const conv = store.get().conversations.find((c) => c.id === msg.conversationId);

      // Update the conversation's lastMessage preview
      if (conv) {
        store.upsertConversation({
          ...conv,
          lastMessageAt: msg.createdAt,
          lastMessage: {
            id: msg.id,
            senderId: msg.senderId,
            type: msg.type,
            content: msg.content,
            deleted: false,
            createdAt: msg.createdAt,
          },
        });
      }

      if (me && msg.senderId !== me.id) {
        bus.emit('messageReceived', msg);
        notifications.notifyMessage(conv, msg);
        if (store.get().activeConversationId === msg.conversationId) {
          this.markRead(msg.conversationId, [msg.id]);
          store.clearUnread(msg.conversationId);
        }
      } else {
        bus.emit('messageSent', msg);
      }
      bus.emit('message', msg);
    });

    this._socket.on('message:updated', (msg: Message) => {
      store.updateMessage(msg.conversationId, msg);
    });

    this._socket.on('message:deleted', (payload: { messageId: number; conversationId: number }) => {
      const existing = store.get().messagesByConversation[payload.conversationId] ?? [];
      const target = existing.find((m) => m.id === payload.messageId);
      if (target) {
        store.updateMessage(payload.conversationId, {
          ...target,
          content: null,
          deletedAt: new Date().toISOString(),
        });
      }
    });

    this._socket.on('message:reaction', (payload: { messageId: number; userId: number; reaction: string; added: boolean }) => {
      const all = store.get().messagesByConversation;
      for (const convId of Object.keys(all)) {
        const list = all[Number(convId)] ?? [];
        const msg = list.find((m) => m.id === payload.messageId);
        if (!msg) continue;
        const reactions = [...(msg.reactions ?? [])];
        const idx = reactions.findIndex((r) => r.userId === payload.userId && r.reaction === payload.reaction);
        if (payload.added && idx === -1) {
          reactions.push({ userId: payload.userId, reaction: payload.reaction, createdAt: new Date().toISOString() });
        } else if (!payload.added && idx !== -1) {
          reactions.splice(idx, 1);
        }
        store.updateMessage(msg.conversationId, { ...msg, reactions });
        break;
      }
    });

    this._socket.on('typing:update', (payload: { conversationId: number; userId: number; isTyping: boolean }) => {
      store.setTyping(payload.conversationId, payload.userId, payload.isTyping);
    });

    this._socket.on('presence:update', (payload: { userId: number; status: string; lastSeenAt: string }) => {
      const online = payload.status === 'online' || payload.status === 'away';
      store.setOnline(payload.userId, online);
      bus.emit(online ? 'userOnline' : 'userOffline', payload);
    });

    // New conversation created (e.g. someone started a direct chat with me)
    this._socket.on('conversation:created', (conv: Conversation) => {
      store.upsertConversation(conv);
      this._socket!.emit('conversation:join', { conversationId: conv.id });
      bus.emit('ready', { conversation: conv });
    });

    // Removed from a group (or I left)
    this._socket.on('conversation:removed', (payload: { conversationId: number }) => {
      store.set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== payload.conversationId),
        activeConversationId:
          s.activeConversationId === payload.conversationId ? null : s.activeConversationId,
      }));
    });

    this._socket.on('error', (err: { code: string; message: string }) => {
      bus.emit('error', err);
    });
  }

  private getDeviceId(): string {
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
}
