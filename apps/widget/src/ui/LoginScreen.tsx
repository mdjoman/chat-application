import { useState } from 'preact/hooks';
import type { ApiClient } from '../services/api-client';
import { store } from '../state/store';
import { bus } from '../services/event-bus';
import { notifications } from '../services/notification-service';
import type { SocketClient } from '../services/socket-client';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

export function LoginScreen(props: {
  api: ApiClient;
  socket: SocketClient;
  tenantSlug: string;
  onAuthed: () => Promise<void>;
  initialResetToken?: string;
}) {
  const [mode, setMode] = useState<Mode>(props.initialResetToken ? 'reset' : 'login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [resetToken, setResetToken] = useState(props.initialResetToken ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(store.get().authError);
  const [info, setInfo] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  async function afterAuth(): Promise<void> {
    void notifications.requestPermission();
    await props.onAuthed();
  }

  async function submitLogin(e: Event) {
    e.preventDefault();
    if (busy) return; setBusy(true); setError(null);
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
      await afterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function submitSignup(e: Event) {
    e.preventDefault();
    if (busy) return;
    if (password !== password2) { setError('Passwords do not match'); return; }
    setBusy(true); setError(null);
    try {
      const deviceId = getOrCreateDeviceId();
      const tokens = await props.api.register({
        tenantSlug: props.tenantSlug,
        username: username.trim(),
        email: email.trim() || undefined,
        password,
        displayName: displayName.trim() || username.trim(),
        deviceId,
      });
      store.setAuth(tokens);
      bus.emit('authenticated', { user: tokens.user });
      await afterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function submitForgot(e: Event) {
    e.preventDefault();
    if (busy) return; setBusy(true); setError(null); setInfo(null); setDevResetUrl(null);
    try {
      const res = await props.api.requestPasswordReset({
        tenantSlug: props.tenantSlug,
        identifier: identifier.trim(),
      });
      setInfo('If an account exists, a reset link has been sent. Check your email.');
      if (res.devResetUrl) {
        setDevResetUrl(res.devResetUrl);
        // In dev, auto-switch to reset mode with the token
        if (res.devToken) {
          setResetToken(res.devToken);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function submitReset(e: Event) {
    e.preventDefault();
    if (busy) return;
    if (newPassword !== newPassword2) { setError('Passwords do not match'); return; }
    setBusy(true); setError(null); setInfo(null);
    try {
      await props.api.confirmPasswordReset({ token: resetToken.trim(), newPassword });
      setInfo('Password updated. You can now sign in.');
      setMode('login');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  return (
    <div class="cw-login">
      {(mode === 'login' || mode === 'signup') && (
        <div class="cw-login__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            class={mode === 'login' ? 'cw-login__tab cw-login__tab--active' : 'cw-login__tab'}
            onClick={() => { setMode('login'); setError(null); setInfo(null); }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            class={mode === 'signup' ? 'cw-login__tab cw-login__tab--active' : 'cw-login__tab'}
            onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
          >
            Create account
          </button>
        </div>
      )}

      <div class="cw-login__title">
        {mode === 'login' && 'Welcome back'}
        {mode === 'signup' && 'Create your account'}
        {mode === 'forgot' && 'Reset your password'}
        {mode === 'reset' && 'Choose a new password'}
      </div>
      <div class="cw-login__sub">
        {mode === 'login' && 'Sign in to continue chatting.'}
        {mode === 'signup' && 'A few details and you are in.'}
        {mode === 'forgot' && 'Enter your username or email to receive a reset link.'}
        {mode === 'reset' && 'Enter the reset code we sent you and a new password.'}
      </div>

      {error && <div class="cw-login__error">{error}</div>}
      {info && <div class="cw-login__info">{info}</div>}
      {devResetUrl && (
        <div class="cw-login__info" style={{ wordBreak: 'break-all' }}>
          Dev reset link: <a href={devResetUrl} target="_blank" rel="noreferrer">{devResetUrl}</a>
        </div>
      )}

      {mode === 'login' && (
        <form onSubmit={submitLogin} class="cw-login__form">
          <label class="cw-field">
            <span class="cw-field__label">Username or email</span>
            <input
              class="cw-field__input" type="text" autocomplete="username"
              value={identifier}
              onInput={(e) => setIdentifier((e.target as HTMLInputElement).value)}
              disabled={busy} required
            />
          </label>
          <label class="cw-field">
            <span class="cw-field__label">Password</span>
            <input
              class="cw-field__input" type="password" autocomplete="current-password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              disabled={busy} required
            />
          </label>
          <button class="cw-login__submit" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            class="cw-login__link"
            onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
          >
            Forgot password?
          </button>
        </form>
      )}

      {mode === 'signup' && (
        <form onSubmit={submitSignup} class="cw-login__form">
          <label class="cw-field">
            <span class="cw-field__label">Username</span>
            <input
              class="cw-field__input" type="text" autocomplete="username"
              value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
              disabled={busy} required minLength={3}
            />
          </label>
          <label class="cw-field">
            <span class="cw-field__label">Display name (optional)</span>
            <input
              class="cw-field__input" type="text"
              value={displayName}
              onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
              disabled={busy}
            />
          </label>
          <label class="cw-field">
            <span class="cw-field__label">Email (optional)</span>
            <input
              class="cw-field__input" type="email" autocomplete="email"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              disabled={busy}
            />
          </label>
          <label class="cw-field">
            <span class="cw-field__label">Password</span>
            <input
              class="cw-field__input" type="password" autocomplete="new-password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              disabled={busy} required minLength={8}
            />
          </label>
          <label class="cw-field">
            <span class="cw-field__label">Confirm password</span>
            <input
              class="cw-field__input" type="password" autocomplete="new-password"
              value={password2}
              onInput={(e) => setPassword2((e.target as HTMLInputElement).value)}
              disabled={busy} required minLength={8}
            />
          </label>
          <button class="cw-login__submit" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={submitForgot} class="cw-login__form">
          <label class="cw-field">
            <span class="cw-field__label">Username or email</span>
            <input
              class="cw-field__input" type="text"
              value={identifier}
              onInput={(e) => setIdentifier((e.target as HTMLInputElement).value)}
              disabled={busy} required
            />
          </label>
          <button class="cw-login__submit" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <button type="button" class="cw-login__link" onClick={() => { setMode('login'); setError(null); setInfo(null); }}>
            Back to sign in
          </button>
          <button type="button" class="cw-login__link" onClick={() => { setMode('reset'); setError(null); setInfo(null); }}>
            I already have a reset code
          </button>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={submitReset} class="cw-login__form">
          <label class="cw-field">
            <span class="cw-field__label">Reset code</span>
            <input
              class="cw-field__input" type="text"
              value={resetToken}
              onInput={(e) => setResetToken((e.target as HTMLInputElement).value)}
              disabled={busy} required
            />
          </label>
          <label class="cw-field">
            <span class="cw-field__label">New password</span>
            <input
              class="cw-field__input" type="password" autocomplete="new-password"
              value={newPassword}
              onInput={(e) => setNewPassword((e.target as HTMLInputElement).value)}
              disabled={busy} required minLength={8}
            />
          </label>
          <label class="cw-field">
            <span class="cw-field__label">Confirm new password</span>
            <input
              class="cw-field__input" type="password" autocomplete="new-password"
              value={newPassword2}
              onInput={(e) => setNewPassword2((e.target as HTMLInputElement).value)}
              disabled={busy} required minLength={8}
            />
          </label>
          <button class="cw-login__submit" type="submit" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
          <button type="button" class="cw-login__link" onClick={() => { setMode('login'); setError(null); setInfo(null); }}>
            Back to sign in
          </button>
        </form>
      )}

      <div class="cw-login__hint">Tenant: <code>{props.tenantSlug}</code></div>
    </div>
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
  } catch { return `w_${Math.random().toString(36).slice(2)}`; }
}
