import { io, type Socket } from 'socket.io-client';
import { store } from '../state/store';
import { bus } from './event-bus';
import type { Message } from '../types';

export class SocketClient {
  private socket: Socket | null = null;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/api\/v1\/?$/, '');
  }

  connect(): void {
    const token = store.get().accessToken;
    if (!token) throw new Error('No access token');

    this.socket = io(this.baseUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token, deviceId: this.getDeviceId() },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      // Re-join every known conversation room
      const convs = store.get().conversations;
      for (const c of convs) {
        this.socket!.emit('conversation:join', { conversationId: c.id });
      }
    });

    this.socket.on('disconnect', (reason) => {
      // eslint-disable-next-line no-console
      console.info('[ChatWidget] socket disconnected:', reason);
    });

    this.socket.on('connect_error', async (err) => {
      if (String(err?.message || '').toUpperCase().includes('UNAUTHORIZED')) {
        const { ApiClient } = await import('./api-client');
        const baseApi = `${this.baseUrl.replace(/\/$/, '')}/api/v1`;
        const api = new ApiClient(baseApi);
        const ok = await api.refreshTokens();
        if (ok) this.socket!.auth = { token: store.get().accessToken };
      }
    });

    this.bindEvents();
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  joinConversation(conversationId: number): void {
    this.socket?.emit('conversation:join', { conversationId });
  }

  sendMessage(input: {
    conversationId: number;
    content: string;
    type?: Message['type'];
    replyToId?: number | null;
    clientId?: string;
  }, ack?: (res: { ok?: boolean; message?: Message; error?: string }) => void): void {
    this.socket?.emit('message:send', input, ack);
  }

  startTyping(conversationId: number): void {
    this.socket?.emit('typing:start', { conversationId });
  }

  stopTyping(conversationId: number): void {
    this.socket?.emit('typing:stop', { conversationId });
  }

  markRead(conversationId: number, messageIds: number[]): void {
    this.socket?.emit('message:read', { conversationId, messageIds });
  }

  react(messageId: number, reaction: string, added: boolean): void {
    this.socket?.emit('message:react', { messageId, reaction, added });
  }

  private bindEvents(): void {
    if (!this.socket) return;

    this.socket.on('message:new', (msg: Message) => {
      store.addMessage(msg);
      const me = store.get().me;
      if (me && msg.senderId !== me.id) {
        bus.emit('messageReceived', msg);
      } else {
        bus.emit('messageSent', msg);
      }
      bus.emit('message', msg);

      // Auto-read if the conversation is active
      if (store.get().activeConversationId === msg.conversationId && msg.senderId !== me?.id) {
        this.markRead(msg.conversationId, [msg.id]);
      }
    });

    this.socket.on('message:updated', (msg: Message) => {
      store.updateMessage(msg.conversationId, msg);
    });

    this.socket.on('message:deleted', (payload: { messageId: number; conversationId: number }) => {
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

    this.socket.on('message:reaction', (payload: {
      messageId: number;
      userId: number;
      reaction: string;
      added: boolean;
    }) => {
      // find message
      const me = store.get().me;
      const msg = findMessageInStore(payload.messageId);
      if (!msg) return;
      const reactions = [...(msg.reactions ?? [])];
      const idx = reactions.findIndex(
        (r) => r.userId === payload.userId && r.reaction === payload.reaction,
      );
      if (payload.added && idx === -1) {
        reactions.push({
          userId: payload.userId,
          reaction: payload.reaction,
          createdAt: new Date().toISOString(),
        });
      } else if (!payload.added && idx !== -1) {
        reactions.splice(idx, 1);
      }
      store.updateMessage(msg.conversationId, { ...msg, reactions });
      void me; // reserved for future "highlight your own reactions"
    });

    this.socket.on('typing:update', (payload: {
      conversationId: number;
      userId: number;
      isTyping: boolean;
    }) => {
      store.setTyping(payload.conversationId, payload.userId, payload.isTyping);
    });

    this.socket.on('presence:update', (payload: {
      userId: number;
      status: string;
      lastSeenAt: string;
    }) => {
      const online = payload.status === 'online' || payload.status === 'away';
      store.setOnline(payload.userId, online);
      bus.emit(online ? 'userOnline' : 'userOffline', payload);
    });

    this.socket.on('error', (err: { code: string; message: string }) => {
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

function findMessageInStore(messageId: number): Message | null {
  const all = store.get().messagesByConversation;
  for (const list of Object.values(all)) {
    const found = list.find((m) => m.id === messageId);
    if (found) return found;
  }
  return null;
}
