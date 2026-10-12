import { useEffect, useMemo, useState } from 'preact/hooks';
import { Launcher } from './Launcher';
import { ConversationList } from './ConversationList';
import { ChatWindow } from './ChatWindow';
import { LoginScreen } from './LoginScreen';
import { NewConversation } from './NewConversation';
import { ConversationInfo } from './ConversationInfo';
import { ProfileScreen } from './ProfileScreen';
import { IconClose, IconMinimize, IconUsers } from './Icons';
import { store } from '../state/store';
import type { Conversation, Message } from '../types';
import type { ApiClient } from '../services/api-client';
import type { SocketClient } from '../services/socket-client';

type View = 'list' | 'chat' | 'new' | 'info' | 'profile';

export function App(props: {
  api: ApiClient;
  socket: SocketClient;
  tenantSlug: string;
  onAuthed: () => Promise<void>;
  onLogout: () => void;
  initialResetToken?: string;
}) {
  const [, setTick] = useState(0);
  const [view, setView] = useState<View>('list');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);

  useEffect(() => store.subscribe(() => setTick((t) => t + 1)), []);

  const s = store.get();
  const meId = s.me?.id ?? 0;

  const features = useMemo(
    () => ({ reaction: true, reply: true, delete: true, edit: true, forward: true, pin: true }),
    [],
  );

  const activeConv: Conversation | null = s.activeConversationId
    ? s.conversations.find((c) => c.id === s.activeConversationId) ?? null
    : null;

  const activeMessages = activeConv ? s.messagesByConversation[activeConv.id] ?? [] : [];
  const typingIds = activeConv
    ? [...(s.typingByConversation[activeConv.id] ?? new Set<number>())]
    : [];

  useEffect(() => {
    if (activeConv && view !== 'info' && view !== 'profile') setView('chat');
    else if (!activeConv && view !== 'new' && view !== 'profile') setView('list');
  }, [activeConv?.id]);

  /** Always fetch the latest history — guarantees messages show after reload. */
  async function fetchLatestHistory(conversationId: number): Promise<void> {
    store.set((prev) => ({
      historyLoadingByConversation: { ...prev.historyLoadingByConversation, [conversationId]: true },
    }));
    try {
      const page = await props.api.history(conversationId, 40, null);
      store.setMessages(conversationId, page.items);
      store.set((prev) => ({
        historyCursorByConversation: { ...prev.historyCursorByConversation, [conversationId]: page.nextCursor },
        historyHasMoreByConversation: { ...prev.historyHasMoreByConversation, [conversationId]: page.hasMore },
      }));
    } finally {
      store.set((prev) => ({
        historyLoadingByConversation: { ...prev.historyLoadingByConversation, [conversationId]: false },
      }));
    }
  }

  async function handleOpenConversation(id: number) {
    store.set({ activeConversationId: id });
    store.clearUnread(id);
    props.socket.joinConversation(id);
    setView('chat');

    await fetchLatestHistory(id);

    const msgs = store.get().messagesByConversation[id] ?? [];
    const unreadIds = msgs.filter((m) => m.senderId !== meId).map((m) => m.id);
    if (unreadIds.length > 0) props.socket.markRead(id, unreadIds.slice(-50));
  }

  async function loadOlder() {
    if (!activeConv) return;
    const hasMore = s.historyHasMoreByConversation[activeConv.id] ?? false;
    if (!hasMore) return;
    const cursor = s.historyCursorByConversation[activeConv.id] ?? null;
    const page = await props.api.history(activeConv.id, 40, cursor);
    store.prependMessages(activeConv.id, page.items);
    store.set((prev) => ({
      historyCursorByConversation: { ...prev.historyCursorByConversation, [activeConv.id]: page.nextCursor },
      historyHasMoreByConversation: { ...prev.historyHasMoreByConversation, [activeConv.id]: page.hasMore },
    }));
  }

  function sendMessage(text: string, attachmentIds: number[], type?: Message['type']) {
    if (!activeConv) return;
    const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    props.socket.sendMessage(
      {
        conversationId: activeConv.id,
        content: text,
        type: type ?? (attachmentIds.length > 0 ? 'file' : 'text'),
        replyToId: replyTo?.id ?? null,
        clientId,
        attachmentIds,
      },
      (res) => {
        if (!res?.ok && res?.error) store.set({ error: `Send failed: ${res.error}` });
        setReplyTo(null);
      },
    );
  }

  function deleteMessage(m: Message) {
    if (!confirm('Delete this message?')) return;
    props.socket.deleteMessage(m.id);
  }

  function submitEdit(text: string) {
    if (!editing) return;
    props.socket.editMessage(editing.id, text);
    setEditing(null);
  }

  function reactToMessage(m: Message, reaction: string, added: boolean) {
    props.socket.react(m.id, reaction, added);
  }

  async function handleForward(m: Message) {
    // Simple forward: prompt for a target conversation id (in production this
    // would be a picker; the API supports multiple target ids).
    const list = s.conversations.filter((c) => c.id !== m.conversationId);
    if (list.length === 0) { store.set({ error: 'No other conversations to forward to' }); return; }
    const choice = prompt(
      `Forward to:\n${list.map((c) => `${c.id} = ${c.name ?? 'Direct #' + c.id}`).join('\n')}\n\nEnter conversation id:`,
    );
    const target = Number(choice);
    if (!Number.isFinite(target) || target <= 0) return;
    try {
      await props.api.forwardMessage(m.id, [target]);
    } catch (err) {
      store.set({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handlePin(m: Message, pinned: boolean) {
    try {
      await props.api.pinMessage(m.id, pinned);
    } catch (err) {
      store.set({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  function startAudioCall() {
    if (!activeConv) return;
    store.set({ error: 'Audio calling arrives in Phase 7' });
  }
  function startVideoCall() {
    if (!activeConv) return;
    store.set({ error: 'Video calling arrives in Phase 8' });
  }

  const isAuthed = s.authStatus === 'authenticated';
  const needsAuth = s.authStatus === 'needs-auth';
  const totalUnread = Object.values(s.unreadByConversation).reduce((a, b) => a + b, 0);

  return (
    <>
      {!s.isOpen && (
        <Launcher open={false} unread={totalUnread} onClick={() => store.set({ isOpen: true })} />
      )}

      {s.isOpen && (
        <div class="cw-panel" role="dialog" aria-label="Chat widget">
          <header class="cw-header">
            <div>
              <div class="cw-header__title">Chat</div>
              <div class="cw-header__sub">
                {isAuthed && s.me
                  ? s.me.displayName
                  : needsAuth
                  ? 'Sign in required'
                  : 'Connecting…'}
              </div>
            </div>
            <div class="cw-header__actions">
              {isAuthed && (
                <button
                  type="button"
                  class="cw-icon-btn"
                  aria-label="Profile"
                  title="Profile"
                  onClick={() => setView('profile')}
                >
                  <IconUsers />
                </button>
              )}
              <button type="button" class="cw-icon-btn" aria-label="Minimize" onClick={() => store.set({ isOpen: false })}>
                <IconMinimize />
              </button>
              <button type="button" class="cw-icon-btn" aria-label="Close" onClick={() => store.set({ isOpen: false })}>
                <IconClose />
              </button>
            </div>
          </header>

          {s.error && (
            <div class="cw-errorbar" onClick={() => store.set({ error: null })}>{s.error}</div>
          )}

          {needsAuth && (
            <LoginScreen
              api={props.api}
              socket={props.socket}
              tenantSlug={props.tenantSlug}
              onAuthed={props.onAuthed}
              initialResetToken={props.initialResetToken}
            />
          )}

          {isAuthed && view === 'list' && (
            <ConversationList
              conversations={s.conversations}
              meId={meId}
              activeId={s.activeConversationId}
              onSelect={handleOpenConversation}
              onNewChat={() => setView('new')}
            />
          )}

          {isAuthed && view === 'new' && (
            <NewConversation
              api={props.api}
              onBack={() => setView('list')}
              onCreated={async (id) => {
                const list = await props.api.listConversations();
                store.set({ conversations: list });
                await handleOpenConversation(id);
              }}
            />
          )}

          {isAuthed && view === 'chat' && activeConv && (
            <ChatWindow
              conversation={activeConv}
              meId={meId}
              messages={activeMessages}
              typingUserIds={typingIds}
              replyTo={replyTo}
              editing={editing}
              features={features}
              api={props.api}
              onBack={() => {
                store.set({ activeConversationId: null });
                setReplyTo(null); setEditing(null); setView('list');
              }}
              onShowInfo={() => setView('info')}
              onSend={sendMessage}
              onTypingStart={() => props.socket.startTyping(activeConv.id)}
              onTypingStop={() => props.socket.stopTyping(activeConv.id)}
              onReply={setReplyTo}
              onCancelReply={() => setReplyTo(null)}
              onEdit={setEditing}
              onCancelEdit={() => setEditing(null)}
              onSubmitEdit={submitEdit}
              onDelete={deleteMessage}
              onReact={reactToMessage}
              onForward={handleForward}
              onPin={handlePin}
              onLoadOlder={loadOlder}
              onStartAudioCall={startAudioCall}
              onStartVideoCall={startVideoCall}
              onError={(msg) => store.set({ error: msg })}
            />
          )}

          {isAuthed && view === 'info' && activeConv && (
            <ConversationInfo
              conversation={activeConv}
              api={props.api}
              meId={meId}
              onBack={() => setView('chat')}
              onLeft={() => {
                store.set({ activeConversationId: null });
                setView('list');
              }}
              onUpdated={(c) => store.upsertConversation(c)}
            />
          )}

          {isAuthed && view === 'profile' && (
            <ProfileScreen
              api={props.api}
              onBack={() => setView(activeConv ? 'chat' : 'list')}
              onLogout={props.onLogout}
            />
          )}

          {s.isLoading && !needsAuth && (
            <div class="cw-empty"><div class="cw-spinner" /></div>
          )}
        </div>
      )}
    </>
  );
}
