import { useEffect, useRef, useState } from 'preact/hooks';
import type { Message } from '../types';
import { IconEdit, IconReply, IconTrash, IconCheck } from './Icons';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function MessageMenu(props: {
  msg: Message;
  isMine: boolean;
  isGroup: boolean;
  canModerate: boolean;
  features: {
    reply: boolean;
    edit: boolean;
    delete: boolean;
    reaction: boolean;
    forward: boolean;
    pin: boolean;
  };
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

  // সর্বশেষ handler গুলো ref-এ রাখি, যাতে native listener সবসময়
  // freshest props দেখে (stale closure সমস্যা এড়াতে)
  const actionsRef = useRef({
    onClose: props.onClose,
    onReply: props.onReply,
    onEdit: props.onEdit,
    onDelete: props.onDelete,
    onReact: props.onReact,
    onCopy: props.onCopy,
    onForward: props.onForward,
    onPin: props.onPin,
  });

  useEffect(() => {
    actionsRef.current = {
      onClose: props.onClose,
      onReply: props.onReply,
      onEdit: props.onEdit,
      onDelete: props.onDelete,
      onReact: props.onReact,
      onCopy: props.onCopy,
      onForward: props.onForward,
      onPin: props.onPin,
    };
  });

  // ---- Native event listener যোগ করি — Shadow DOM-এও কাজ করবে ----
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();

      const action = target.dataset.action;
      const a = actionsRef.current;

      console.log('[MessageMenu] action fired:', action);

      switch (action) {
        case 'toggle-reactions':
          setShowReactions(true);
          return;
        case 'react': {
          const reaction = target.dataset.reaction ?? '';
          if (reaction) a.onReact(reaction);
          a.onClose();
          return;
        }
        case 'reply':
          a.onReply();
          a.onClose();
          return;
        case 'edit':
          a.onEdit();
          a.onClose();
          return;
        case 'copy':
          a.onCopy();
          a.onClose();
          return;
        case 'forward':
          a.onForward();
          a.onClose();
          return;
        case 'pin':
          a.onPin();
          a.onClose();
          return;
        case 'delete':
          a.onDelete();
          a.onClose();
          return;
        default:
          return;
      }
    };

    const handleOutside = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        actionsRef.current.onClose();
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actionsRef.current.onClose();
    };

    root.addEventListener('click', handleClick, true);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);

    return () => {
      root.removeEventListener('click', handleClick, true);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const isDeleted = Boolean(props.msg.deletedAt);

  return (
    <div ref={ref} class="cw-menu" role="menu">
      {props.features.reaction && !isDeleted && (
        <div class="cw-menu__reactions">
          {!showReactions ? (
            <button
              type="button"
              class="cw-menu__item cw-menu__item--react"
              data-action="toggle-reactions"
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
                  data-action="react"
                  data-reaction={r}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {props.features.reply && !isDeleted && (
        <button type="button" class="cw-menu__item" data-action="reply">
          <IconReply width={14} height={14} /> Reply
        </button>
      )}

      {props.isMine && props.features.edit && props.msg.type === 'text' && !isDeleted && (
        <button type="button" class="cw-menu__item" data-action="edit">
          <IconEdit width={14} height={14} /> Edit
        </button>
      )}

      <button type="button" class="cw-menu__item" data-action="copy">
        📋 Copy text
      </button>

      {props.features.forward && !isDeleted && (
        <button type="button" class="cw-menu__item" data-action="forward">
          ↗ Forward
        </button>
      )}

      {props.features.pin && !isDeleted && (
        <button type="button" class="cw-menu__item" data-action="pin">
          {props.msg.pinnedAt ? '📌 Unpin' : '📌 Pin'}
          {props.msg.pinnedAt && <IconCheck width={12} height={12} />}
        </button>
      )}

      {(props.isMine || (props.isGroup && props.canModerate)) &&
        props.features.delete &&
        !isDeleted && (
          <button
            type="button"
            class="cw-menu__item cw-menu__item--danger"
            data-action="delete"
          >
            <IconTrash width={14} height={14} /> Delete
          </button>
        )}
    </div>
  );
}