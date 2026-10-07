import type { Message } from '../types';
import { IconReply, IconTrash } from './Icons';
import { ReactionPicker } from './ReactionPicker';

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble(props: {
  msg: Message;
  isMine: boolean;
  meId: number;
  features: { reaction: boolean; reply: boolean; delete: boolean };
  onReply: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  onReact: (msg: Message, reaction: string, added: boolean) => void;
}) {
  const { msg, isMine } = props;
  const mineReactions = new Set(
    (msg.reactions ?? []).filter((r) => r.userId === props.meId).map((r) => r.reaction),
  );
  const counts = new Map<string, number>();
  for (const r of msg.reactions ?? []) counts.set(r.reaction, (counts.get(r.reaction) ?? 0) + 1);

  const isDeleted = Boolean(msg.deletedAt);

  return (
    <div class={`cw-msg ${isMine ? 'cw-msg--me' : 'cw-msg--them'} ${isDeleted ? 'cw-msg--deleted' : ''}`}>
      {msg.replyToId && <div class="cw-msg__reply">Reply to #{msg.replyToId}</div>}
      <div>{isDeleted ? 'This message was deleted' : msg.content ?? ''}</div>
      <div class="cw-msg__meta">
        {timeLabel(msg.createdAt)}
        {msg.editedAt ? ' · edited' : ''}
      </div>

      {!isDeleted && (
        <div class="cw-msg__reactions">
          {[...counts.entries()].map(([reaction, count]) => (
            <button
              key={reaction}
              type="button"
              class="cw-reaction"
              data-mine={mineReactions.has(reaction)}
              onClick={() =>
                props.onReact(msg, reaction, !mineReactions.has(reaction))
              }
            >
              <span>{reaction}</span>
              <span>{count}</span>
            </button>
          ))}
        </div>
      )}

      {!isDeleted && (
        <div class="cw-msg__actions">
          {props.features.reply && (
            <button type="button" onClick={() => props.onReply(msg)} title="Reply">
              <IconReply width={14} height={14} />
            </button>
          )}
          {props.features.reaction && (
            <div title="React">
              <ReactionPicker onPick={(r) => props.onReact(msg, r, true)} />
            </div>
          )}
          {isMine && props.features.delete && (
            <button type="button" onClick={() => props.onDelete(msg)} title="Delete">
              <IconTrash width={14} height={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
