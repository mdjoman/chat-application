import { useEffect, useMemo, useState } from 'preact/hooks';
import { Launcher } from './Launcher';
import { ConversationList } from './ConversationList';
import { ChatWindow } from './ChatWindow';
import { LoginScreen } from './LoginScreen';
import { IconClose, IconMinimize } from './Icons';
import { store } from '../state/store';
import type { Message } from '../types';
import type { ApiClient } from '../services/api-client';
import type { SocketClient } from '../services/socket-client';

export function App(props: {
  api: ApiClient;
  socket: SocketClient;
  tenantSlug: string;
  onAuthed: () => Promise<void>;
}) {
  const [, setTick] = useState(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  useEffect(() => store.subscribe(() => setTick((t) => t + 1)), []);

  const s = store.get();
  const meId = s.me?.id ?? 0;

  const features = useMemo(
    () => ({ reaction: true, reply: true, delete: true }),
    [],
  );

  const activeConv = s.activeConversationId
    ? s.conversations.find((c) => c.id === s.activeConversationId) ?? null
    : null;

  const activeMessages = activeConv ? s.messagesByConversation[activeConv.id] ?? [] : [];
  const typingIds = activeConv
    ? [...(s.typingByConversation[activeConv.id] ?? new Set<number>())]
    : [];

  async function handleOpenConversation(id: number) {
    store.set({ activeConversationId: id });

    const loaded = store.get().historyLoadedByConversation[id];
    if (!loaded) {
      const page = await props.api.history(id, 30, null);
      store.prependMessages(id, page.items);
      store.set((prev) => ({
        historyCursorByConversation: {
          ...prev.historyCursorByConversation,
          [id]: page.nextCursor,
        },
        historyHasMoreByConversation: {
          ...prev.historyHasMoreByConversation,
          [id]: page.hasMore,
        },
        historyLoadedByConversation: {
          ...prev.historyLoadedByConversation,
          [id]: true,
        },
      }));
    }

    const msgs = store.get().messagesByConversation[id] ?? [];
    const unreadIds = msgs.filter((m) => m.senderId !== meId).map((m) => m.id);
    if (unreadIds.length > 0) {
      props.socket.markRead(id, unreadIds.slice(-50));
    }
  }

  async function loadOlder() {
    if (!activeConv) return;
    const hasMore = s.historyHasMoreByConversation[activeConv.id] ?? false;
    if (!hasMore) return;
    const cursor = s.historyCursorByConversation[activeConv.id] ?? null;
    const page = await props.api.history(activeConv.id, 30, cursor);
    store.prependMessages(activeConv.id, page.items);
    store.set((prev) => ({
      historyCursorByConversation: {
        ...prev.historyCursorByConversation,
        [activeConv.id]: page.nextCursor,
      },
      historyHasMoreByConversation: {
        ...prev.historyHasMoreByConversation,
        [activeConv.id]: page.hasMore,
      },
    }));
  }

  function sendMessage(text: string) {
    if (!activeConv) return;
    const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    props.socket.sendMessage(
      {
        conversationId: activeConv.id,
        content: text,
        type: 'text',
        replyToId: replyTo?.id ?? null,
        clientId,
      },
      (res) => {
        if (!res?.ok && res?.error) {
          store.set({ error: `Send failed: ${res.error}` });
        }
        setReplyTo(null);
      },
    );
  }

  function deleteMessage(m: Message) {
    if (!activeConv) return;
    if (!confirm('Delete this message?')) return;
    // Use the socket helper exposed on SocketClient
    props.socket.react; // ensure type-touch (no-op)
    // @ts-expect-error internal
    props.socket['socket']?.emit?.('message:delete', { messageId: m.id });
  }

  function reactToMessage(m: Message, reaction: string, added: boolean) {
    props.socket.react(m.id, reaction, added);
  }

  const isAuthed = s.authStatus === 'authenticated';
  const needsAuth = s.authStatus === 'needs-auth';

  return (
    <>
      {!s.isOpen && (
        <Launcher open={false} unread={0} onClick={() => store.set({ isOpen: true })} />
      )}

      {s.isOpen && (
        <div class="cw-panel" role="dialog" aria-label="Chat widget">
          <header class="cw-header">
            <div>
              <div class="cw-header__title">Support Chat</div>
              <div class="cw-header__sub">
                {isAuthed && s.me
                  ? `Signed in as ${s.me.displayName}`
                  : needsAuth
                  ? 'Sign in required'
                  : 'Connecting…'}
              </div>
            </div>
            <div class="cw-header__actions">
              <button
                type="button"
                class="cw-icon-btn"
                aria-label="Minimize"
                onClick={() => store.set({ isOpen: false })}
              >
                <IconMinimize />
              </button>
              <button
                type="button"
                class="cw-icon-btn"
                aria-label="Close"
                onClick={() => store.set({ isOpen: false })}
              >
                <IconClose />
              </button>
            </div>
          </header>

          {s.error && (
            <div
              style={{
                padding: '8px 12px',
                background: '#fee2e2',
                color: '#991b1b',
                fontSize: 12,
              }}
            >
              {s.error}
            </div>
          )}

          {/* Needs auth → show login */}
          {needsAuth && (
            <LoginScreen
              api={props.api}
              socket={props.socket}
              tenantSlug={props.tenantSlug}
              onAuthed={props.onAuthed}
            />
          )}

          {/* Authenticated → normal UI */}
          {isAuthed && !activeConv && (
            <ConversationList
              conversations={s.conversations}
              meId={meId}
              activeId={s.activeConversationId}
              onSelect={handleOpenConversation}
            />
          )}

          {isAuthed && activeConv && (
            <ChatWindow
              conversation={activeConv}
              meId={meId}
              messages={activeMessages}
              typingUserIds={typingIds}
              replyTo={replyTo}
              features={features}
              onBack={() => {
                store.set({ activeConversationId: null });
                setReplyTo(null);
              }}
              onSend={sendMessage}
              onTypingStart={() => props.socket.startTyping(activeConv.id)}
              onTypingStop={() => props.socket.stopTyping(activeConv.id)}
              onReply={setReplyTo}
              onCancelReply={() => setReplyTo(null)}
              onDelete={deleteMessage}
              onReact={reactToMessage}
              onLoadOlder={loadOlder}
            />
          )}

          {s.isLoading && !needsAuth && (
            <div class="cw-empty">
              <div class="cw-spinner" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
