import { useRef, useState } from 'preact/hooks';
import type { ApiClient } from '../services/api-client';
import { store } from '../state/store';

export function ProfileScreen(props: {
  api: ApiClient;
  onBack: () => void;
  onLogout: () => void;
}) {
  const me = store.get().me;
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [statusText, setStatusText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement | null>(null);

  async function save() {
    setBusy(true); setError(null); setInfo(null);
    try {
      const updated = await props.api.updateMe({
        displayName: displayName.trim() || undefined,
        statusText: statusText.trim() || undefined,
      });
      store.set({ me: updated });
      setInfo('Profile updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function uploadAvatar(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      await props.api.uploadAvatar(files[0]!);
      const me = await props.api.me();
      store.set({ me });
      setInfo('Avatar updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (avatarInput.current) avatarInput.current.value = '';
    }
  }

  if (!me) return null;

  return (
    <div class="cw-chat">
      <div class="cw-chat__header">
        <button type="button" class="cw-icon-btn cw-icon-btn--ghost" onClick={props.onBack} aria-label="Back">
          ←
        </button>
        <div style={{ flex: 1, fontWeight: 700 }}>Profile</div>
      </div>

      <div style={{ padding: 20, textAlign: 'center', borderBottom: '1px solid var(--cw-border)' }}>
        <button
          type="button"
          class="cw-avatar cw-avatar--xl cw-avatar--button"
          style={{ margin: '0 auto 12px' }}
          onClick={() => avatarInput.current?.click()}
          title="Change avatar"
        >
          {me.avatarUrl ? <img src={me.avatarUrl} alt={me.displayName} /> : me.displayName.slice(0, 2).toUpperCase()}
          <span class="cw-avatar__edit">📷</span>
        </button>
        <input
          ref={avatarInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => uploadAvatar((e.target as HTMLInputElement).files)}
        />
        <div style={{ fontWeight: 700, fontSize: 18 }}>{me.displayName}</div>
        <div style={{ fontSize: 12, color: 'var(--cw-text-muted)', marginTop: 4 }}>@{me.username}</div>
      </div>

      {error && <div class="cw-login__error" style={{ margin: 12 }}>{error}</div>}
      {info && <div class="cw-login__info" style={{ margin: 12 }}>{info}</div>}

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto' }}>
        <label class="cw-field">
          <span class="cw-field__label">Display name</span>
          <input
            class="cw-field__input"
            type="text"
            value={displayName}
            onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
            disabled={busy}
          />
        </label>

        <label class="cw-field">
          <span class="cw-field__label">Status text</span>
          <input
            class="cw-field__input"
            type="text"
            value={statusText}
            onInput={(e) => setStatusText((e.target as HTMLInputElement).value)}
            placeholder="Available"
            disabled={busy}
          />
        </label>

        <label class="cw-field">
          <span class="cw-field__label">Email</span>
          <input class="cw-field__input" type="email" value={me.email ?? ''} disabled />
        </label>

        <button type="button" class="cw-login__submit" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div class="cw-chat__footer">
        <button
          type="button"
          class="cw-login__submit"
          style={{ background: '#EF4444' }}
          onClick={props.onLogout}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
