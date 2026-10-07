import { store } from '../state/store';
import type {
  AuthTokens,
  Conversation,
  CurrentUser,
  Message,
} from '../types';

export interface HistoryPage {
  items: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class ApiClient {
  private baseUrl: string;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // ---- Auth ----
  /**
   * Exchange a widget-token (JWT signed by the host backend) for
   * platform access + refresh tokens.
   */
  async exchangeWidgetToken(widgetToken: string, deviceId: string): Promise<AuthTokens> {
    const res = await fetch(`${this.baseUrl}/auth/widget-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': deviceId },
      body: JSON.stringify({ widgetToken }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`auth failed: ${res.status} ${text}`);
    }
    return (await res.json()) as AuthTokens;
  }

  /**
   * Direct login with username/email + password (used when the widget
   * runs standalone, without a host backend to mint widget tokens).
   */
  async login(input: {
    tenantSlug: string;
    identifier: string;
    password: string;
    deviceId: string;
  }): Promise<AuthTokens> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-id': input.deviceId,
      },
      body: JSON.stringify({
        tenantSlug: input.tenantSlug,
        identifier: input.identifier,
        password: input.password,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = `Login failed (${res.status})`;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        /* not JSON */
      }
      throw new Error(message);
    }
    return (await res.json()) as AuthTokens;
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
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  // ---- Users ----
  async me(): Promise<CurrentUser> {
    return this.request<CurrentUser>('GET', '/users/me');
  }

  // ---- Conversations ----
  async listConversations(): Promise<Conversation[]> {
    const page = await this.request<{ items: Conversation[] }>('GET', '/conversations?limit=50');
    return page.items;
  }

  async createDirect(peerId: number): Promise<Conversation> {
    return this.request<Conversation>('POST', '/conversations', {
      type: 'direct',
      peerId,
    });
  }

  // ---- Messages ----
  async history(
    conversationId: number,
    limit = 30,
    cursor?: string | null,
  ): Promise<HistoryPage> {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    return this.request<HistoryPage>(
      'GET',
      `/conversations/${conversationId}/messages?${qs.toString()}`,
    );
  }

  // ---- Generic ----
  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    retry = true,
  ): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = store.get().accessToken;
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && retry) {
      const refreshed = await this.refreshTokens();
      if (refreshed) return this.request<T>(method, path, body, false);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${path} → ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
