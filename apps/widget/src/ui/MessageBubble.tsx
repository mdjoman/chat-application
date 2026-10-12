import { useState } from 'preact/hooks';
import type { Message, ConversationMember } from '../types';
import { MessageMenu } from './MessageMenu';
import { Lightbox, type LightboxMedia } from './Lightbox';
import { formatLocalTime, humanSize } from '../utils/time';

interface Attachment {
  id: number;
  mimeType: string;
  url: string;
  sizeBytes: number;
  originalName: string | null;
}

export function MessageBubble(props: {
  msg: Message;
  isMine: boolean;
  meId: number;
  sender: ConversationMember | undefined;
  isGroup: boolean;
  canModerate: boolean;
  features: { reply: boolean; edit: boolean; delete: boolean; reaction: boolean; forward: boolean; pin: boolean };
  onReply: (m: Message) => void;
  onDelete: (m: Message) => void;
  onEdit: (m: Message) => void;
  onReact: (m: Message, reaction: string, added: boolean) => void;
  onForward: (m: Message) => void;
  onPin: (m: Message, pinned: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);

  const { msg, isMine } = props;
  const mineReactions = new Set((msg.reactions ?? []).filter((r) => r.userId === props.meId).map((r) => r.reaction));
  const counts = new Map<string, number>();
  for (const r of msg.reactions ?? []) counts.set(r.reaction, (counts.get(r.reaction) ?? 0) + 1);

  const isDeleted = Boolean(msg.deletedAt);
  const attachments = (msg.attachments ?? []) as unknown as Attachment[];

  const senderName = props.sender?.displayName ?? `User #${msg.senderId ?? '?'}`;
  const initials = senderName.split(/\s+/).map((s) => s[0] || '').join('').slice(0, 2).toUpperCase();

  return (
    <div class={`cw-msgRow ${isMine ? 'cw-msgRow--me' : 'cw-msgRow--them'}`}>
      {!isMine && props.isGroup && (
        <div class="cw-msgRow__avatar" title={senderName}>
          {props.sender?.avatarUrl ? (
            <img src={props.sender.avatarUrl} alt={senderName} />
          ) : (
            <span>{initials}</span>
          )}
        </div>
      )}

      <div class={`cw-msg ${isMine ? 'cw-msg--me' : 'cw-msg--them'} ${isDeleted ? 'cw-msg--deleted' : ''}`}>
        {!isMine && props.isGroup && (
          <div class="cw-msg__sender">{senderName}</div>
        )}

        {msg.replyToId && <div class="cw-msg__reply">Reply to #{msg.replyToId}</div>}

        {msg.pinnedAt && <div class="cw-msg__pinned">📌 Pinned</div>}
        {msg.forwardedFromId && <div class="cw-msg__forwarded">↗ Forwarded</div>}

        {!isDeleted && attachments.map((a) => (
          <AttachmentView
            key={a.id}
            attachment={a}
            onOpen={(media) => setLightbox(media)}
          />
        ))}
        {!isDeleted && msg.content && <div class="cw-msg__text">{msg.content}</div>}
        {isDeleted && <div class="cw-msg__text">This message was deleted</div>}

        <div class="cw-msg__meta">
          {formatLocalTime(msg.createdAt)}
          {msg.editedAt ? ' · edited' : ''}
        </div>

        {!isDeleted && counts.size > 0 && (
          <div class="cw-msg__reactions">
            {[...counts.entries()].map(([reaction, count]) => (
              <button
                key={reaction}
                type="button"
                class="cw-reaction"
                data-mine={mineReactions.has(reaction)}
                onClick={() => props.onReact(msg, reaction, !mineReactions.has(reaction))}
              >
                <span>{reaction}</span>
                <span>{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* 3-dot menu trigger (always visible) */}
        {!isDeleted && (
          <button
            type="button"
            class="cw-msg__more"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Message options"
            title="Message options"
          >
            ⋮
          </button>
        )}

        {menuOpen && (
          <MessageMenu
            msg={msg}
            isMine={isMine}
            isGroup={props.isGroup}
            canModerate={props.canModerate}
            canPin={true}
            features={props.features}
            onClose={() => setMenuOpen(false)}
            onReply={() => props.onReply(msg)}
            onEdit={() => props.onEdit(msg)}
            onDelete={() => props.onDelete(msg)}
            onReact={(reaction) => props.onReact(msg, reaction, !mineReactions.has(reaction))}
            onCopy={() => {
              const text = msg.content ?? '';
              if (text) void navigator.clipboard.writeText(text);
            }}
            onForward={() => props.onForward(msg)}
            onPin={() => props.onPin(msg, !msg.pinnedAt)}
          />
        )}
      </div>

      <Lightbox media={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

function AttachmentView({
  attachment,
  onOpen,
}: {
  attachment: Attachment;
  onOpen: (m: LightboxMedia) => void;
}) {
  const mime = attachment.mimeType;

  if (mime.startsWith('image/')) {
    return (
      <div class="cw-attach cw-attach--image">
        <button
          type="button"
          class="cw-attach__open"
          onClick={() => onOpen({ kind: 'image', url: attachment.url, name: attachment.originalName })}
        >
          <img src={attachment.url} alt={attachment.originalName ?? 'image'} loading="lazy" />
        </button>
      </div>
    );
  }

  if (mime.startsWith('video/')) {
    return (
      <div class="cw-attach cw-attach--video">
        <button
          type="button"
          class="cw-attach__open"
          onClick={() => onOpen({ kind: 'video', url: attachment.url, name: attachment.originalName })}
        >
          <video src={attachment.url} preload="metadata" />
          <span class="cw-attach__play">▶</span>
        </button>
      </div>
    );
  }

  if (mime.startsWith('audio/')) {
    return (
      <div class="cw-attach cw-attach--audio">
        <audio src={attachment.url} controls preload="metadata" />
      </div>
    );
  }

  return (
    <a class="cw-attach cw-attach--file" href={attachment.url} target="_blank" rel="noreferrer" download>
      <span>📄</span>
      <span class="cw-attach__name">{attachment.originalName ?? 'file'}</span>
      <span class="cw-attach__size">{humanSize(attachment.sizeBytes)}</span>
    </a>
  );
}
