import { useEffect, useRef, useState } from 'preact/hooks';
import type { Message } from '../types';
import { IconEdit, IconReply, IconTrash, IconCheck, IconUsers } from './Icons';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function MessageMenu(props: {
  msg: Message;
  isMine: boolean;
  isGroup: boolean;
  canModerate: boolean;
  canPin: boolean;
  features: { reply: boolean; edit: boolean; delete: boolean; reaction: boolean; forward: boolean; pin: boolean };
  onClose: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (reaction: string) => void;
  onCopy: () => void;
  onForward: () => void;
  onPin: () => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) props.onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [props]);

  const isDeleted = Boolean(props.msg.deletedAt);

  return (
    <div ref={ref} class="cw-menu" role="menu">
      {props.features.reaction && !isDeleted && (
        <div class="cw-menu__reactions">
          {!showReactions ? (
            <button
              type="button"
              class="cw-menu__item cw-menu__item--react"
              onClick={() => setShowReactions(true)}
            >
              🙂 React…
            </button>
          ) : (
            <div class="cw-menu__reactionRow">
              {REACTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  class="cw-menu__reactionBtn"
                  onClick={() => { props.onReact(r); props.onClose(); }}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {props.features.reply && !isDeleted && (
        <button type="button" class="cw-menu__item" onClick={() => { props.onReply(); props.onClose(); }}>
          <IconReply width={14} height={14} /> Reply
        </button>
      )}

      {props.isMine && props.features.edit && props.msg.type === 'text' && !isDeleted && (
        <button type="button" class="cw-menu__item" onClick={() => { props.onEdit(); props.onClose(); }}>
          <IconEdit width={14} height={14} /> Edit
        </button>
      )}

      <button type="button" class="cw-menu__item" onClick={() => { props.onCopy(); props.onClose(); }}>
        📋 Copy text
      </button>

      {props.features.forward && !isDeleted && (
        <button type="button" class="cw-menu__item" onClick={() => { props.onForward(); props.onClose(); }}>
          ↗ Forward
        </button>
      )}

      {props.features.pin && !isDeleted && (
        <button type="button" class="cw-menu__item" onClick={() => { props.onPin(); props.onClose(); }}>
          <IconUsers width={14} height={14} />
          {props.msg.pinnedAt ? 'Unpin' : 'Pin'}
          {props.msg.pinnedAt && <IconCheck width={12} height={12} />}
        </button>
      )}

      {(props.isMine || (props.isGroup && props.canModerate)) && props.features.delete && !isDeleted && (
        <button
          type="button"
          class="cw-menu__item cw-menu__item--danger"
          onClick={() => { props.onDelete(); props.onClose(); }}
        >
          <IconTrash width={14} height={14} /> Delete
        </button>
      )}
    </div>
  );
}
