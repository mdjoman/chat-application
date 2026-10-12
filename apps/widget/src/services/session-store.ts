interface StoredSession {
  v: 2;
  appId: string;
  origin: string;
  refreshToken: string;
  user: {
    id: number;
    tenantId: number;
    username: string;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
  };
  savedAt: number;
}

const SALT = 'chat-widget-v2';
const STORAGE_PREFIX = 'chat_widget_session:';
const MARKER_PREFIX = 'chat_widget_active:';

function cryptoBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(data.byteLength));
  bytes.set(data);
  return bytes;
}

function storageKey(appId: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'unknown';
  return `${STORAGE_PREFIX}${appId}:${origin}`;
}

function markerKey(appId: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'unknown';
  return `${MARKER_PREFIX}${appId}:${origin}`;
}

async function deriveKey(appId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    cryptoBytes(enc.encode(`${SALT}:${appId}`)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: cryptoBytes(enc.encode(SALT)),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));

  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }

  return bytes;
}

async function encrypt(appId: string, data: string): Promise<string> {
  const key = await deriveKey(appId);

  const iv = crypto.getRandomValues(
    new Uint8Array(new ArrayBuffer(12)),
  );

  const encoded = cryptoBytes(new TextEncoder().encode(data));

  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  return `${toBase64(iv)}.${toBase64(cipher)}`;
}

async function decrypt(appId: string, blob: string): Promise<string> {
  const [ivB64, ctB64] = blob.split('.');

  if (!ivB64 || !ctB64) {
    throw new Error('invalid blob');
  }

  const key = await deriveKey(appId);

  const iv = fromBase64(ivB64);
  const ct = fromBase64(ctB64);

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ct,
  );

  return new TextDecoder().decode(plain);
}

export const sessionStore = {
  async save(session: Omit<StoredSession, 'v' | 'savedAt'>): Promise<void> {
    try {
      const payload: StoredSession = { v: 2, savedAt: Date.now(), ...session };
      const blob = await encrypt(session.appId, JSON.stringify(payload));
      localStorage.setItem(storageKey(session.appId), blob);
      // Also drop a lightweight marker we can check without decryption
      localStorage.setItem(
        markerKey(session.appId),
        JSON.stringify({ userId: session.user.id, savedAt: payload.savedAt }),
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ChatWidget] failed to save session', err);
    }
  },

  async load(appId: string): Promise<StoredSession | null> {
    try {
      const blob = localStorage.getItem(storageKey(appId));
      if (!blob) return null;
      const plain = await decrypt(appId, blob);
      const parsed = JSON.parse(plain) as StoredSession;
      if (parsed.v !== 2) return null;
      if (Date.now() - parsed.savedAt > 90 * 24 * 3600 * 1000) return null;
      return parsed;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ChatWidget] failed to load session', err);
      return null;
    }
  },

  hasMarker(appId: string): boolean {
    try {
      return Boolean(localStorage.getItem(markerKey(appId)));
    } catch {
      return false;
    }
  },

  clear(appId: string): void {
    try {
      localStorage.removeItem(storageKey(appId));
      localStorage.removeItem(markerKey(appId));
    } catch {
      /* ignore */
    }
  },
};
