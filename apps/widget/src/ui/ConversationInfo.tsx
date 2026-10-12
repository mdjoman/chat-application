import { useEffect, useState } from 'preact/hooks';
import type { ApiClient, UserHit } from '../services/api-client';
import type { Conversation, ConversationMember } from '../types';
import { IconBack, IconPlus, IconTrash, IconCheck, IconSearch } from './Icons';
import { store } from '../state/store';

export function ConversationInfo(props: {
  conversation: Conversation;
  api: ApiClient;
  meId: number;
  onBack: () => void;
  onLeft: () => void;
  onUpdated: (c: Conversation) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(props.conversation.name ?? '');

  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const isGroup = props.conversation.type === 'group';
  const myRole = props.conversation.myRole ?? 'member';
  const canManage = myRole === 'owner' || myRole === 'admin';
  const other = props.conversation.members.find((m) => m.userId !== props.meId);

  // Search users (excluding current members)
  useEffect(() => {
    if (!adding) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const term = q.trim();
        if (term.length < 1) { setHits([]); return; }
        const items = await props.api.listUsers(term);
        const existing = new Set(props.conversation.members.map((m) => m.userId));
        if (!cancelled) setHits(items.filter((u) => !existing.has(u.id)));
      } catch { /* ignore */ }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [q, adding, props.api, props.conversation.members]);

  async function doRename() {
    if (!newName.trim() || newName.trim() === props.conversation.name) {
      setRenaming(false);
      return;
    }
    setBusy(true); setError(null);
    try {
      const c = await props.api.renameGroup(props.conversation.id, newName.trim());
      props.onUpdated(c);
      setRenaming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function addSelected() {
    if (selected.size === 0) return;
    setBusy(true); setError(null);
    try {
      const c = await props.api.addGroupMembers(props.conversation.id, [...selected]);
      props.onUpdated(c);
      setAdding(false); setSelected(new Set()); setQ(''); setHits([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function removeMember(userId: number) {
    if (!confirm('Remove this member from the group?')) return;
    setBusy(true); setError(null);
    try {
      await props.api.removeGroupMember(props.conversation.id, userId);
      const c = await props.api.getConversation(props.conversation.id);
      props.onUpdated(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function toggleAdmin(m: ConversationMember) {
    if (myRole !== 'owner') return;
    setBusy(true); setError(null);
    try {
      await props.api.promoteMember(props.conversation.id, m.userId, m.role === 'admin' ? 'member' : 'admin');
      const c = await props.api.getConversation(props.conversation.id);
      props.onUpdated(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function leave() {
    if (!confirm('Leave this group?')) return;
    setBusy(true); setError(null);
    try {
      await props.api.leaveGroup(props.conversation.id);
      props.onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  const title = isGroup ? props.conversation.name ?? 'Group' : other?.displayName ?? `User #${other?.userId ?? '?'}`;

  return (
    <div class="cw-chat">
      <div class="cw-chat__header">
        <button type="button" class="cw-icon-btn cw-icon-btn--ghost" onClick={props.onBack} aria-label="Back">
          <IconBack />
        </button>
        <div style={{ flex: 1, fontWeight: 700 }}>{isGroup ? 'Group info' : 'Contact info'}</div>
      </div>

      <div style={{ padding: 20, textAlign: 'center', borderBottom: '1px solid var(--cw-border)' }}>
        <div class="cw-avatar cw-avatar--xl" style={{ margin: '0 auto 12px' }}>
          {other?.avatarUrl && !isGroup ? (
            <img src={other.avatarUrl} alt={title} />
          ) : (
            title.slice(0, 2).toUpperCase()
          )}
        </div>

        {!renaming && (
          <>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--cw-text-muted)', marginTop: 4 }}>
              {isGroup
                ? `${props.conversation.members.length} members · your role: ${myRole}`
                : other?.username ? `@${other.username}` : 'Direct message'}
            </div>
            {isGroup && canManage && (
              <button
                type="button"
                class="cw-login__link"
                onClick={() => { setNewName(props.conversation.name ?? ''); setRenaming(true); }}
                style={{ marginTop: 8 }}
              >
                Rename group
              </button>
            )}
          </>
        )}

        {renaming && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <input
              class="cw-field__input"
              type="text"
              value={newName}
              onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
              maxLength={190}
              autoFocus
            />
            <button type="button" class="cw-send" onClick={doRename} disabled={busy}>✓</button>
            <button type="button" class="cw-icon-btn cw-icon-btn--ghost" onClick={() => setRenaming(false)}>×</button>
          </div>
        )}
      </div>

      {error && <div class="cw-login__error" style={{ margin: 12 }}>{error}</div>}

      {isGroup && canManage && !adding && (
        <div style={{ padding: 12, borderBottom: '1px solid var(--cw-border)' }}>
          <button
            type="button"
            class="cw-login__submit"
            onClick={() => setAdding(true)}
            style={{ width: '100%' }}
          >
            <IconPlus width={14} height={14} /> Add members
          </button>
        </div>
      )}

      {adding && (
        <div style={{ padding: 12, borderBottom: '1px solid var(--cw-border)' }}>
          <div class="cw-searchbox" style={{ marginBottom: 8 }}>
            <IconSearch width={14} height={14} />
            <input
              type="text"
              placeholder="Search users to add…"
              value={q}
              onInput={(e) => setQ((e.target as HTMLInputElement).value)}
              autoFocus
            />
          </div>

          {hits.map((u) => {
            const isSel = selected.has(u.id);
            return (
              <div
                key={u.id}
                class="cw-conv"
                data-active={isSel}
                onClick={() => {
                  setSelected((s) => {
                    const next = new Set(s);
                    if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                    return next;
                  });
                }}
              >
                <div class="cw-avatar">
                  {u.avatarUrl ? <img src={u.avatarUrl} alt={u.displayName} /> : u.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div class="cw-conv__body">
                  <div class="cw-conv__title">{u.displayName}</div>
                  <div class="cw-conv__preview">@{u.username}</div>
                </div>
                {isSel && <IconCheck width={16} height={16} />}
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              class="cw-login__submit"
              style={{ flex: 1 }}
              disabled={selected.size === 0 || busy}
              onClick={addSelected}
            >
              {busy ? 'Adding…' : `Add ${selected.size || ''}`.trim()}
            </button>
            <button
              type="button"
              class="cw-icon-btn cw-icon-btn--ghost"
              onClick={() => { setAdding(false); setSelected(new Set()); setQ(''); setHits([]); }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '14px 14px 6px', fontSize: 12, color: 'var(--cw-text-muted)', textTransform: 'uppercase', letterSpacing: .6 }}>
          {isGroup ? `Members (${props.conversation.members.length})` : 'Contact'}
        </div>

        {props.conversation.members.map((m) => {
          const canRemoveMe =
            isGroup && m.userId !== props.meId && (myRole === 'owner' || (myRole === 'admin' && m.role === 'member'));
          const canPromote = isGroup && myRole === 'owner' && m.userId !== props.meId;
          return (
            <div key={m.userId} class="cw-conv" style={{ cursor: 'default' }}>
              <div class="cw-avatar">
                {m.avatarUrl ? <img src={m.avatarUrl} alt={m.displayName} /> : m.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div class="cw-conv__body">
                <div class="cw-conv__title">
                  {m.displayName}{m.userId === props.meId ? ' (you)' : ''}
                </div>
                <div class="cw-conv__preview">
                  @{m.username} · {m.role}
                </div>
              </div>
              {canPromote && (
                <button
                  type="button"
                  class="cw-icon-btn cw-icon-btn--ghost"
                  title={m.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                  onClick={() => toggleAdmin(m)}
                  disabled={busy}
                >
                  {m.role === 'admin' ? '↓' : '↑'}
                </button>
              )}
              {canRemoveMe && (
                <button
                  type="button"
                  class="cw-icon-btn cw-icon-btn--ghost"
                  title="Remove from group"
                  onClick={() => removeMember(m.userId)}
                  disabled={busy}
                >
                  <IconTrash width={16} height={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div class="cw-chat__footer">
        {isGroup ? (
          <button
            type="button"
            class="cw-login__submit"
            style={{ background: '#EF4444' }}
            disabled={busy}
            onClick={leave}
          >
            {busy ? 'Leaving…' : 'Leave group'}
          </button>
        ) : (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--cw-text-muted)' }}>
            Direct conversations cannot be left.
          </div>
        )}
      </div>
    </div>
  );
}

// silence unused
void store;
