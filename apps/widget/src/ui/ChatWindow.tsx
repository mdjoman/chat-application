import { useEffect, useRef } from 'preact/hooks';
import type { Conversation, Message } from '../types';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { IconBack } from './Icons';

export function ChatWindow(props: {
  conversation: Conversation;
  meId: number;
  messages: Message[];
  typingUserIds: number[];
  replyTo: Message | null;
  features: {
    reaction: boolean;
    reply: boolean;
    delete: boolean;
  };
  onBack: () => void;
  onSend: (text: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onReply: (m: Message) => void;
  onCancelReply: () => void;
  onDelete: (m: Message) => void;
  onReact: (m: Message, reaction: string, added: boolean) => void;
  onLoadOlder: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (props.messages.length !== lastCount.current) {
      // If we're near bottom (or a new message arrived), stick to bottom
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (nearBottom || props.messages.length > lastCount.current) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
      lastCount.current = props.messages.length;
    }
  }, [props.messages.length]);

  // Load older when scrolled to top
  function handleScroll() {
    const el = bodyRef.current;
    if (!el) return;
    if (el.scrollTop < 40) {
      props.onLoadOlder();
    }
  }

  const title =
    props.conversation.type === 'group'
      ? props.conversation.name ?? 'Group'
      : `User #${props.conversation.members.find((m) => m.userId !== props.meId)?.userId ?? '?'}`;

  return (
    <div class="cw-chat">
      <div class="cw-chat__header">
        <button type="button" class="cw-icon-btn" onClick={props.onBack} aria-label="Back">
          <IconBack />
        </button>
        <div>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--cw-text-muted)' }}>
            {props.conversation.type === 'group'
              ? `${props.conversation.members.length} members`
              : 'Direct message'}
          </div>
        </div>
      </div>

      <div class="cw-chat__body" ref={bodyRef} onScroll={handleScroll}>
        {props.messages.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            isMine={m.senderId === props.meId}
            meId={props.meId}
            features={props.features}
            onReply={props.onReply}
            onDelete={props.onDelete}
            onReact={props.onReact}
          />
        ))}
      </div>

      <TypingIndicator count={props.typingUserIds.length} />

      <div class="cw-chat__footer">
        <MessageInput
          disabled={false}
          replyTo={props.replyTo}
          onCancelReply={props.onCancelReply}
          onTypingStart={props.onTypingStart}
          onTypingStop={props.onTypingStop}
          onSend={props.onSend}
        />
      </div>
    </div>
  );
}
