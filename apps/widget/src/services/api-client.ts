import { store } from '../state/store';
import type { AuthTokens, Conversation, CurrentUser, Message } from '../types';

export interface HistoryPage {
  items: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface UserHit {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  statusText: string | null;
  lastSeenAt: string | null;
}

export class ApiClient {
  readonly baseUrl: string;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async exchangeWidgetToken(widgetToken: string, deviceId: string): Promise<AuthTokens> {
    const res = await fetch(`${this.baseUrl}/auth/widget-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': deviceId },
      body: JSON.stringify({ widgetToken }),
    });
    if (!res.ok) throw new Error(`auth failed: ${res.status} ${await res.text().catch(() => '')}`);
    return (await res.json()) as AuthTokens;
  }

  async login(input: { tenantSlug: string; identifier: string; password: string; deviceId: string }): Promise<AuthTokens> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': input.deviceId },
      body: JSON.stringify({ tenantSlug: input.tenantSlug, identifier: input.identifier, password: input.password }),
    });
    if (!res.ok) throw new Error(await parseError(res, 'Login failed'));
    return (await res.json()) as AuthTokens;
  }

  async register(input: {
    tenantSlug: string; username: string; email?: string; password: string; displayName?: string; deviceId: string;
  }): Promise<AuthTokens> {
    const res = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': input.deviceId },
      body: JSON.stringify({
        tenantSlug: input.tenantSlug,
        username: input.username,
        email: input.email,
        password: input.password,
        displayName: input.displayName,
      }),
    });
    if (!res.ok) throw new Error(await parseError(res, 'Registration failed'));
    return (await res.json()) as AuthTokens;
  }

  async requestPasswordReset(input: { tenantSlug: string; identifier: string }): Promise<{
    ok: true; devResetUrl?: string; devToken?: string;
  }> {
    const res = await fetch(`${this.baseUrl}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await parseError(res, 'Request failed'));
    return (await res.json()) as { ok: true; devResetUrl?: string; devToken?: string };
  }

  async confirmPasswordReset(input: { token: string; newPassword: string }): Promise<{ ok: true }> {
    const res = await fetch(`${this.baseUrl}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await parseError(res, 'Reset failed'));
    return (await res.json()) as { ok: true };
  }

  async refreshTokens(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const refreshToken = store.get().refreshToken;
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as AuthTokens;
        store.setAuth(body);
        return true;
      } catch { return false; } finally { this.refreshPromise = null; }
    })();
    return this.refreshPromise;
  }

  async me(): Promise<CurrentUser> { return this.request<CurrentUser>('GET', '/users/me'); }

  async updateMe(patch: { displayName?: string; avatarUrl?: string | null; statusText?: string | null }): Promise<CurrentUser> {
    return this.request<CurrentUser>('PATCH', '/users/me', patch);
  }

  async uploadAvatar(file: File): Promise<{ ok: true; avatarUrl: string }> {
    const token = store.get().accessToken;
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}/users/me/avatar`);
      if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Invalid JSON')); }
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      const form = new FormData();
      form.append('file', file, file.name);
      xhr.send(form);
    });
  }

  async listConversations(): Promise<Conversation[]> {
    const page = await this.request<{ items: Conversation[] }>('GET', '/conversations?limit=50');
    return page.items;
  }

  async getConversation(id: number): Promise<Conversation> {
    return this.request<Conversation>('GET', `/conversations/${id}`);
  }

  async createDirect(peerId: number): Promise<Conversation> {
    return this.request<Conversation>('POST', '/conversations', { type: 'direct', peerId });
  }

  async createGroup(input: { name: string; memberIds: number[]; avatarUrl?: string | null }): Promise<Conversation> {
    return this.request<Conversation>('POST', '/conversations', {
      type: 'group',
      name: input.name,
      memberIds: input.memberIds,
      avatarUrl: input.avatarUrl ?? null,
    });
  }

  async addGroupMembers(conversationId: number, memberIds: number[]): Promise<Conversation> {
    return this.request<Conversation>('POST', `/conversations/${conversationId}/members`, { memberIds });
  }

  async removeGroupMember(conversationId: number, userId: number): Promise<void> {
    await this.request<void>('DELETE', `/conversations/${conversationId}/members/${userId}`);
  }

  async leaveGroup(conversationId: number): Promise<void> {
    // NOTE: no body — do not set content-type
    await this.request<void>('POST', `/conversations/${conversationId}/leave`);
  }

  async renameGroup(conversationId: number, name: string): Promise<Conversation> {
    return this.request<Conversation>('PATCH', `/conversations/${conversationId}`, { name });
  }

  async promoteMember(conversationId: number, userId: number, role: 'admin' | 'member'): Promise<void> {
    await this.request<void>('POST', `/conversations/${conversationId}/members/${userId}/role`, { role });
  }

  async listUsers(term: string): Promise<UserHit[]> {
    if (!term.trim()) return [];
    const qs = new URLSearchParams({ q: term });
    const page = await this.request<{ items: UserHit[] }>('GET', `/users/search?${qs}`);
    return page.items;
  }

  async getPublicUser(id: number): Promise<PublicUser> {
    return this.request<PublicUser>('GET', `/users/${id}`);
  }

  async history(conversationId: number, limit = 30, cursor?: string | null): Promise<HistoryPage> {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    return this.request<HistoryPage>('GET', `/conversations/${conversationId}/messages?${qs}`);
  }

  async forwardMessage(messageId: number, targetConversationIds: number[]): Promise<{ items: Message[] }> {
    return this.request<{ items: Message[] }>('POST', `/messages/${messageId}/forward`, {
      targetConversationIds,
    });
  }

  async pinMessage(messageId: number, pinned: boolean): Promise<Message> {
    return this.request<Message>('POST', `/messages/${messageId}/pin`, { pinned });
  }

  async listPinned(conversationId: number): Promise<{ items: Message[] }> {
    return this.request<{ items: Message[] }>('GET', `/conversations/${conversationId}/pinned`);
  }

  async getNotificationPrefs(): Promise<Record<string, boolean> | null> {
    try {
      const s = await this.request<{ notification_prefs: Record<string, boolean> | null }>('GET', '/users/me/settings');
      return s.notification_prefs ?? null;
    } catch { return null; }
  }

  async uploadAttachment(
    file: File,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<{
    id: number; messageId: number | null; mimeType: string; sizeBytes: number;
    originalName: string | null; url: string; metadata: Record<string, unknown> | null;
  }> {
    const token = store.get().accessToken;
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}/attachments/upload`);
      if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(e.loaded, e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Invalid JSON')); }
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      const form = new FormData();
      form.append('file', file, file.name);
      xhr.send(form);
    });
  }

  async getTurnCredentials(): Promise<{ urls: string[]; username: string; credential: string; ttl: number }> {
    return this.request('GET', '/turn/credentials');
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    retry = true,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    const token = store.get().accessToken;
    if (token) headers.authorization = `Bearer ${token}`;

    // Only set Content-Type when sending a body — fixes "Body cannot be empty" error.
    const hasBody = body !== undefined && body !== null;
    if (hasBody) headers['content-type'] = 'application/json';

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && retry) {
      const refreshed = await this.refreshTokens();
      if (refreshed) return this.request<T>(method, path, body, false);
    }

    if (!res.ok) throw new Error(await parseError(res, `${method} ${path}`));
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const text = await res.text();
    const parsed = JSON.parse(text);
    if (parsed?.error?.message) return parsed.error.message;
    return `${fallback} (${res.status})`;
  } catch {
    return `${fallback} (${res.status})`;
  }
}
