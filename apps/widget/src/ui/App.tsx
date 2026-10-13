import { useEffect, useMemo, useState } from 'preact/hooks';
import { Launcher } from './Launcher';
import { ConversationList } from './ConversationList';
import { ChatWindow } from './ChatWindow';
import { LoginScreen } from './LoginScreen';
import { NewConversation } from './NewConversation';
import { ConversationInfo } from './ConversationInfo';
import { ProfileScreen } from './ProfileScreen';
import { CallOverlay } from './CallOverlay';
import { CallHistory } from './CallHistory';
import { IconClose, IconMinimize, IconUsers, IconPhone } from './Icons';
import { store } from '../state/store';
import type { Conversation, Message } from '../types';
import type { ApiClient } from '../services/api-client';
import type { SocketClient } from '../services/socket-client';
import type { CallController } from '../services/call-controller';

type View = 'list' | 'chat' | 'new' | 'info' | 'profile' | 'calls';

export function App(props: {
  api: ApiClient;
  socket: SocketClient;
  call: CallController;
  tenantSlug: string;
  onAuthed: () => Promise<void>;
  onLogout: () => void;
  initialResetToken?: string;
}) {
  const [, setTick] = useState(0);
  const [view, setView] = useState<View>('list');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);

  // Call UI state (mirrors CallController)
  const [callState, setCallState] = useState(props.call.getState());

  // Re-render on any store change.
  useEffect(() => store.subscribe(() => setTick((t) => t + 1)), []);
  // Re-render on any call state change.
  useEffect(() => props.call.subscribe(setCallState), [props.call]);

  // On mount + on window focus: refresh conversations so newly added
  // groups appear even if the tab was backgrounded when the socket event
  // was broadcast.
  useEffect(() => {
    const onFocus = () => {
      if (store.get().authStatus === 'authenticated') {
        void props.socket.refreshConversations();
      }
    };
    // Also refresh immediately after the app mounts.
    if (store.get().authStatus === 'authenticated') {
      void props.socket.refreshConversations();
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [props.socket]);

  const s = store.get();
  const meId = s.me?.id ?? 0;

  const features = useMemo(
    () => ({
      reaction: true,
      reply: true,
      delete: true,
      edit: true,
      forward: true,
      pin: true,
    }),
    [],
  );

  const activeConv: Conversation | null = s.activeConversationId
    ? s.conversations.find((c) => c.id === s.activeConversationId) ?? null
    : null;

  const activeMessages = activeConv
    ? s.messagesByConversation[activeConv.id] ?? []
    : [];

  const typingIds = activeConv
    ? [...(s.typingByConversation[activeConv.id] ?? new Set<number>())]
    : [];

  useEffect(() => {
    if (callState.call) return;
    if (activeConv && view !== 'info' && view !== 'profile' && view !== 'calls') {
      setView('chat');
    } else if (
      !activeConv &&
      view !== 'new' &&
      view !== 'profile' &&
      view !== 'calls'
    ) {
      setView('list');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConv?.id, callState.call]);

  // ---------------------------------------------------------------
  // History
  // ---------------------------------------------------------------

  async function fetchLatestHistory(conversationId: number): Promise<void> {
    store.set((prev) => ({
      historyLoadingByConversation: {
        ...prev.historyLoadingByConversation,
        [conversationId]: true,
      },
    }));
    try {
      const page = await props.api.history(conversationId, 40, null);
      store.setMessages(conversationId, page.items);
      store.set((prev) => ({
        historyCursorByConversation: {
          ...prev.historyCursorByConversation,
          [conversationId]: page.nextCursor,
        },
        historyHasMoreByConversation: {
          ...prev.historyHasMoreByConversation,
          [conversationId]: page.hasMore,
        },
      }));
    } finally {
      store.set((prev) => ({
        historyLoadingByConversation: {
          ...prev.historyLoadingByConversation,
          [conversationId]: false,
        },
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

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------

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
        if (!res?.ok && res?.error) {
          store.set({ error: `Send failed: ${res.error}` });
        }
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
    const list = s.conversations.filter((c) => c.id !== m.conversationId);
    if (list.length === 0) {
      store.set({ error: 'No other conversations to forward to' });
      return;
    }
    const choice = prompt(
      `Forward to:\n${list
        .map((c) => `${c.id} = ${c.name ?? 'Direct #' + c.id}`)
        .join('\n')}\n\nEnter conversation id:`,
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

  async function startAudioCall() {
    if (!activeConv) return;
    if (callState.call) {
      store.set({ error: 'Already in a call' });
      return;
    }
    try {
      await props.call.startOutgoing(activeConv.id, 'audio');
    } catch (err) {
      store.set({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function startVideoCall() {
    if (!activeConv) return;
    if (callState.call) {
      store.set({ error: 'Already in a call' });
      return;
    }
    try {
      await props.call.startOutgoing(activeConv.id, 'video');
    } catch (err) {
      store.set({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ---------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------

  const isAuthed = s.authStatus === 'authenticated';
  const needsAuth = s.authStatus === 'needs-auth';
  const totalUnread = Object.values(s.unreadByConversation).reduce(
    (a, b) => a + b,
    0,
  );

  const callPeerLabel = (() => {
    const c = callState.call;
    if (!c) return 'Call';
    const other = c.participants.find((p) => p.userId !== meId);
    const conv = s.conversations.find((cc) => cc.id === c.conversationId);
    const otherMember = conv?.members.find((m) => m.userId === other?.userId);
    return otherMember?.displayName ?? `User #${other?.userId ?? '?'}`;
  })();

  const firstRemoteStream = callState.remoteStreams.size
    ? [...callState.remoteStreams.values()][0]!
    : null;

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  return (
    <>
      {!s.isOpen && !callState.call && (
        <Launcher
          open={false}
          unread={totalUnread}
          onClick={() => store.set({ isOpen: true })}
        />
      )}

      {s.isOpen && !callState.call && (
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
                <>
                  <button
                    type="button"
                    class="cw-icon-btn"
                    aria-label="Call history"
                    title="Call history"
                    onClick={() => setView('calls')}
                  >
                    <IconPhone />
                  </button>
                  <button
                    type="button"
                    class="cw-icon-btn"
                    aria-label="Profile"
                    title="Profile"
                    onClick={() => setView('profile')}
                  >
                    <IconUsers />
                  </button>
                </>
              )}
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
              class="cw-errorbar"
              onClick={() => store.set({ error: null })}
            >
              {s.error}
            </div>
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
                // Refresh list, then open the created conversation.
                await props.socket.refreshConversations();
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
                setReplyTo(null);
                setEditing(null);
                setView('list');
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
              onUpdated={(c) => {
                store.upsertConversation(c);
                // Also refresh the full list to pick up any member changes.
                void props.socket.refreshConversations();
              }}
            />
          )}

          {isAuthed && view === 'profile' && (
            <ProfileScreen
              api={props.api}
              onBack={() => setView(activeConv ? 'chat' : 'list')}
              onLogout={props.onLogout}
            />
          )}

          {isAuthed && view === 'calls' && (
            <CallHistory api={props.api} onBack={() => setView('list')} />
          )}

          {s.isLoading && !needsAuth && (
            <div class="cw-empty">
              <div class="cw-spinner" />
            </div>
          )}
        </div>
      )}

      {callState.call && callState.status !== 'idle' && (
        <CallOverlay
          call={callState.call}
          direction={callState.direction ?? 'outgoing'}
          status={callState.status}
          localStream={callState.localStream}
          remoteStream={firstRemoteStream}
          micMuted={callState.micMuted}
          cameraOn={callState.cameraOn}
          quality={callState.quality}
          peerLabel={callPeerLabel}
          onAccept={() => void props.call.accept()}
          onReject={() => void props.call.reject()}
          onHangUp={() => void props.call.hangUp()}
          onToggleMic={() => props.call.toggleMic()}
          onToggleCamera={() => void props.call.toggleCamera()}
          onSwitchCamera={() => void props.call.switchCamera()}
        />
      )}
    </>
  );
}