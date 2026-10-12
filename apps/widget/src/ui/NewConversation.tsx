import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ApiClient, UserHit } from '../services/api-client';
import { IconBack, IconCheck, IconUsers, IconPlus } from './Icons';
import { store } from '../state/store';

export function NewConversation(props: {
  api: ApiClient;
  onBack: () => void;
  onCreated: (conversationId: number) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meId = store.get().me?.id ?? 0;

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const term = q.trim();
      if (term.length < 1) { setHits([]); return; }
      try {
        const items = await props.api.listUsers(term);
        if (!cancelled) setHits(items.filter((u) => u.id !== meId));
      } catch { /* ignore */ }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [q, props.api, meId]);

  const canCreateGroup = selected.size >= 2 && groupName.trim().length > 0;
  const canStartDirect = selected.size === 1;

  async function createDirect(peerId: number) {
    setCreating(true); setError(null);
    try {
      const conv = await props.api.createDirect(peerId);
      props.onCreated(conv.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setCreating(false); }
  }

  async function createGroup() {
    if (!canCreateGroup) return;
    setCreating(true); setError(null);
    try {
      const conv = await props.api.createGroup({ name: groupName.trim(), memberIds: [...selected] });
      props.onCreated(conv.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setCreating(false); }
  }

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const header = useMemo(
    () =>
      selected.size === 0
        ? 'New chat'
        : selected.size === 1
        ? 'Start direct chat'
        : `New group · ${selected.size} people`,
    [selected.size],
  );

  return (
    <div class="cw-chat">
      <div class="cw-chat__header">
        <button type="button" class="cw-icon-btn cw-icon-btn--ghost" onClick={props.onBack} aria-label="Back">
          <IconBack />
        </button>
        <div style={{ flex: 1, fontWeight: 700 }}>{header}</div>
      </div>

      <div style={{ padding: '10px 12px 6px' }}>
        {selected.size >= 2 && (
          <div class="cw-field" style={{ marginBottom: 8 }}>
            <input
              class="cw-field__input"
              type="text"
              placeholder="Group name"
              value={groupName}
              onInput={(e) => setGroupName((e.target as HTMLInputElement).value)}
              maxLength={190}
            />
          </div>
        )}
        <input
          class="cw-field__input"
          type="text"
          placeholder="Search by name or username…"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          autoFocus
        />
      </div>

      {error && <div class="cw-login__error" style={{ margin: '0 12px' }}>{error}</div>}

      <div class="cw-list" style={{ flex: 1, overflowY: 'auto' }}>
        {hits.length === 0 && q.trim().length > 0 && (
          <div class="cw-empty">No users match "{q}"</div>
        )}
        {hits.map((u) => {
          const isSel = selected.has(u.id);
          return (
            <div key={u.id} class="cw-conv" data-active={isSel} onClick={() => toggle(u.id)}>
              <div class="cw-avatar">{initials(u.displayName)}</div>
              <div class="cw-conv__body">
                <div class="cw-conv__title">{u.displayName}</div>
                <div class="cw-conv__preview">@{u.username}</div>
              </div>
              {isSel && <IconCheck />}
            </div>
          );
        })}
      </div>

      <div class="cw-chat__footer" style={{ display: 'flex', gap: 8 }}>
        {canStartDirect && (
          <button
            type="button"
            class="cw-login__submit"
            style={{ flex: 1 }}
            disabled={creating}
            onClick={() => createDirect([...selected][0]!)}
          >
            {creating ? 'Opening…' : 'Start chat'}
          </button>
        )}
        {selected.size >= 2 && (
          <button
            type="button"
            class="cw-login__submit"
            style={{ flex: 1 }}
            disabled={!canCreateGroup || creating}
            onClick={createGroup}
          >
            <IconUsers width={14} height={14} /> {creating ? 'Creating…' : 'Create group'}
          </button>
        )}
        {selected.size === 0 && (
          <div class="cw-empty" style={{ width: '100%', padding: 8 }}>
            <IconPlus width={16} height={16} /> Pick one user for a direct chat, or two or more for a group
          </div>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map((s) => s[0] || '').join('').slice(0, 2).toUpperCase();
}
