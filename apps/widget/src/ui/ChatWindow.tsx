import { useEffect, useRef, useState } from 'preact/hooks';
import type { Conversation, Message } from '../types';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { IconBack, IconPhone, IconVideo, IconInfo, IconSearch } from './Icons';
import type { ApiClient } from '../services/api-client';
import { store } from '../state/store';

export function ChatWindow(props: {
  conversation: Conversation;
  meId: number;
  messages: Message[];
  typingUserIds: number[];
  replyTo: Message | null;
  editing: Message | null;
  features: { reaction: boolean; reply: boolean; delete: boolean; edit: boolean; forward: boolean; pin: boolean };
  api: ApiClient;
  onBack: () => void;
  onShowInfo: () => void;
  onSend: (text: string, attachmentIds: number[], type?: Message['type']) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onReply: (m: Message) => void;
  onCancelReply: () => void;
  onEdit: (m: Message) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (text: string) => void;
  onDelete: (m: Message) => void;
  onReact: (m: Message, reaction: string, added: boolean) => void;
  onForward: (m: Message) => void;
  onPin: (m: Message, pinned: boolean) => void;
  onLoadOlder: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onError: (msg: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (props.messages.length !== lastCount.current) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
      if (nearBottom || props.messages.length > lastCount.current) {
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      }
      lastCount.current = props.messages.length;
    }
  }, [props.messages.length]);

  function handleScroll() {
    const el = bodyRef.current;
    if (!el) return;
    if (el.scrollTop < 60) props.onLoadOlder();
  }

  const isGroup = props.conversation.type === 'group';
  const other = props.conversation.members.find((m) => m.userId !== props.meId);
  const title = isGroup
    ? props.conversation.name ?? 'Group'
    : other?.displayName ?? `User #${other?.userId ?? '?'}`;

  const canModerate = props.conversation.myRole === 'owner' || props.conversation.myRole === 'admin';
  const memberById = new Map(props.conversation.members.map((m) => [m.userId, m]));
  const readSet = store.get().readMessageIds;

  return (
    <div class="cw-chat">
      <div class="cw-chat__header">
        <button type="button" class="cw-icon-btn cw-icon-btn--ghost" onClick={props.onBack} aria-label="Back">
          <IconBack />
        </button>

        <button
          type="button"
          onClick={props.onShowInfo}
          class="cw-chat__titleBtn"
        >
          <div class="cw-chat__title">{title}</div>
          <div class="cw-chat__subtitle">
            {isGroup ? `${props.conversation.members.length} members` : 'Direct message'}
          </div>
        </button>

        <button type="button" class="cw-icon-btn cw-icon-btn--ghost" onClick={props.onStartAudioCall} aria-label="Audio call">
          <IconPhone width={18} height={18} />
        </button>
        <button type="button" class="cw-icon-btn cw-icon-btn--ghost" onClick={props.onStartVideoCall} aria-label="Video call">
          <IconVideo width={18} height={18} />
        </button>
        <button type="button" class="cw-icon-btn cw-icon-btn--ghost" onClick={props.onShowInfo} aria-label="Info">
          <IconInfo width={18} height={18} />
        </button>
      </div>

      <div class="cw-chat__body" ref={bodyRef} onScroll={handleScroll}>
        {props.messages.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            isMine={m.senderId === props.meId}
            meId={props.meId}
            sender={m.senderId != null ? memberById.get(m.senderId) : undefined}
            isGroup={isGroup}
            canModerate={canModerate}
            readByOthers={readSet.has(m.id)}
            features={props.features}
            onReply={props.onReply}
            onDelete={props.onDelete}
            onEdit={props.onEdit}
            onReact={props.onReact}
            onForward={props.onForward}
            onPin={props.onPin}
          />
        ))}
      </div>

      <TypingIndicator count={props.typingUserIds.length} />

      <div class="cw-chat__footer">
        {props.editing ? (
          <div class="cw-input">
            <div class="cw-replybar">
              <span>Editing message #{props.editing.id}</span>
              <button type="button" onClick={props.onCancelEdit} aria-label="Cancel edit">×</button>
            </div>
            <EditInput initial={props.editing.content ?? ''} onSubmit={props.onSubmitEdit} onCancel={props.onCancelEdit} />
          </div>
        ) : (
          <MessageInput
            disabled={false}
            replyTo={props.replyTo}
            api={props.api}
            onCancelReply={props.onCancelReply}
            onTypingStart={props.onTypingStart}
            onTypingStop={props.onTypingStop}
            onSend={props.onSend}
            onError={props.onError}
          />
        )}
      </div>
    </div>
  );
}

function EditInput(props: { initial: string; onSubmit: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(props.initial);
  const ta = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (ta.current) {
      ta.current.focus();
      ta.current.setSelectionRange(text.length, text.length);
    }
  }, []);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <textarea
        ref={ta}
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (text.trim()) props.onSubmit(text.trim());
          }
          if (e.key === 'Escape') props.onCancel();
        }}
        rows={1}
        style={{ flex: 1 }}
      />
      <button type="button" class="cw-send" onClick={() => text.trim() && props.onSubmit(text.trim())}>✓</button>
    </div>
  );
}

void IconSearch;