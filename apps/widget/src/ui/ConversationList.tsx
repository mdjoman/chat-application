import { useState } from 'preact/hooks';
import type { Conversation } from '../types';
import { IconPlus, IconSearch } from './Icons';
import { formatLocalDateTime } from '../utils/time';

export function ConversationList(props: {
  conversations: Conversation[];
  meId: number;
  activeId: number | null;
  onSelect: (id: number) => void;
  onNewChat: () => void;
}) {
  const [q, setQ] = useState('');

  const filtered = props.conversations.filter((c) => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    const title = getTitle(c, props.meId).toLowerCase();
    if (title.includes(needle)) return true;
    return c.members.some(
      (m) => m.displayName.toLowerCase().includes(needle) || m.username.toLowerCase().includes(needle),
    );
  });

  return (
    <div class="cw-list">
      <div class="cw-list__toolbar">
        <div class="cw-searchbox">
          <IconSearch width={14} height={14} />
          <input
            type="search"
            placeholder="Search chats"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          />
        </div>
        <button
          type="button"
          class="cw-icon-btn cw-icon-btn--primary"
          onClick={props.onNewChat}
          aria-label="New chat"
          title="New chat"
        >
          <IconPlus />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div class="cw-empty">
            <p>No conversations</p>
            <p style={{ fontSize: 12, marginTop: 6 }}>
              Tap <strong>+</strong> to start a new chat or create a group.
            </p>
          </div>
        )}

        {filtered.map((c) => {
          const title = getTitle(c, props.meId);
          const avatarUrl = getAvatar(c, props.meId);
          const initials = initialsOf(title);
          const preview = previewText(c);
          const timestamp = c.lastMessage?.createdAt ?? c.lastMessageAt;

          return (
            <div
              key={c.id}
              class="cw-conv"
              data-active={c.id === props.activeId}
              onClick={() => props.onSelect(c.id)}
            >
              <div class="cw-avatar">
                {avatarUrl ? <img src={avatarUrl} alt={title} /> : initials}
              </div>

              <div class="cw-conv__body">
                <div class="cw-conv__row">
                  <div class="cw-conv__title">{title}</div>
                  {timestamp && (
                    <div class="cw-conv__time">{formatLocalDateTime(timestamp)}</div>
                  )}
                </div>
                <div class="cw-conv__row">
                  <div class="cw-conv__preview">{preview}</div>
                  {c.unreadCount > 0 && (
                    <div class="cw-conv__unread">{c.unreadCount > 99 ? '99+' : c.unreadCount}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getTitle(c: Conversation, meId: number): string {
  if (c.type === 'group') return c.name ?? 'Group';
  const other = c.members.find((m) => m.userId !== meId);
  return other?.displayName ?? `User #${other?.userId ?? '?'}`;
}

function getAvatar(c: Conversation, meId: number): string | null {
  if (c.type === 'group') return c.avatarUrl ?? null;
  const other = c.members.find((m) => m.userId !== meId);
  return other?.avatarUrl ?? null;
}

function initialsOf(title: string): string {
  return title.split(/\s+/).map((s) => s[0] || '').join('').slice(0, 2).toUpperCase();
}

function previewText(c: Conversation): string {
  const lm = c.lastMessage;
  if (!lm) return c.type === 'group' ? `${c.members.length} members` : 'No messages yet';
  if (lm.deleted) return 'This message was deleted';
  if (lm.content) return lm.content;
  switch (lm.type) {
    case 'image': return '📷 Photo';
    case 'video': return '🎥 Video';
    case 'audio': return '🎵 Audio';
    case 'voice': return '🎤 Voice message';
    case 'file': return '📄 File';
    default: return 'Message';
  }
}
