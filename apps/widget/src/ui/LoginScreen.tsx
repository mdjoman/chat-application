import { useState } from 'preact/hooks';
import type { ApiClient } from '../services/api-client';
import { store } from '../state/store';
import { bus } from '../services/event-bus';
import type { SocketClient } from '../services/socket-client';

export function LoginScreen(props: {
  api: ApiClient;
  socket: SocketClient;
  tenantSlug: string;
  onAuthed: () => Promise<void>;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(store.get().authError);

  async function submit(e: Event) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const deviceId = getOrCreateDeviceId();
      const tokens = await props.api.login({
        tenantSlug: props.tenantSlug,
        identifier: identifier.trim(),
        password,
        deviceId,
      });
      store.setAuth(tokens);
      bus.emit('authenticated', { user: tokens.user });

      // Bring up socket + load conversations
      await props.onAuthed();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      store.set({ authError: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="cw-login" onSubmit={submit}>
      <div class="cw-login__title">Sign in to chat</div>
      <div class="cw-login__sub">Enter your account to start messaging.</div>

      {error && <div class="cw-login__error">{error}</div>}

      <label class="cw-field">
        <span class="cw-field__label">Username or email</span>
        <input
          class="cw-field__input"
          type="text"
          value={identifier}
          autocomplete="username"
          onInput={(e) => setIdentifier((e.target as HTMLInputElement).value)}
          disabled={busy}
          required
        />
      </label>

      <label class="cw-field">
        <span class="cw-field__label">Password</span>
        <input
          class="cw-field__input"
          type="password"
          value={password}
          autocomplete="current-password"
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          disabled={busy}
          required
        />
      </label>

      <button class="cw-login__submit" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <div class="cw-login__hint">
        Tenant: <code>{props.tenantSlug}</code>
      </div>
    </form>
  );
}

function getOrCreateDeviceId(): string {
  const KEY = 'chat_widget_device_id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `w_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `w_${Math.random().toString(36).slice(2)}`;
  }
}
