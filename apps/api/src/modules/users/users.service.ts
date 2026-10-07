import type { Knex } from 'knex';
import { NotFoundError } from '../../utils/errors.js';
import { UsersRepository, type UserRow, type UserSettingsRow } from './users.repository.js';

export interface PublicProfile {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  statusText: string | null;
  lastSeenAt: string | null;
  online?: boolean;
}

export interface MeProfile extends PublicProfile {
  email: string | null;
  role: string;
  tenantId: number;
}

export class UsersService {
  private readonly repo: UsersRepository;
  constructor(private readonly db: Knex) {
    this.repo = new UsersRepository(db);
  }

  async getMe(tenantId: number, userId: number): Promise<MeProfile> {
    const row = await this.repo.findById(tenantId, userId);
    if (!row) throw new NotFoundError('User not found');
    return this.toMe(row);
  }

  async updateMe(
    tenantId: number,
    userId: number,
    patch: { displayName?: string; avatarUrl?: string | null; statusText?: string | null },
  ): Promise<MeProfile> {
    await this.repo.updateProfile(tenantId, userId, {
      display_name: patch.displayName,
      avatar_url: patch.avatarUrl,
      status_text: patch.statusText,
    });
    return this.getMe(tenantId, userId);
  }

  async getPublic(
    tenantId: number,
    viewerId: number,
    targetId: number,
  ): Promise<PublicProfile> {
    const row = await this.repo.findById(tenantId, targetId);
    if (!row || !row.is_active) throw new NotFoundError('User not found');

    // Privacy: enforce "last seen" visibility
    const settings = await this.repo.getSettings(targetId);
    const lastSeenVisible = settings?.privacy_last_seen !== 'nobody';
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      statusText: row.status_text,
      lastSeenAt: lastSeenVisible && row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    };
  }

  async search(tenantId: number, q: string, limit = 20, offset = 0): Promise<PublicProfile[]> {
    if (q.trim().length < 1) return [];
    const rows = await this.repo.search(tenantId, q.trim(), Math.min(limit, 50), offset);
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      statusText: r.status_text,
      lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
    }));
  }

  async getSettings(userId: number): Promise<UserSettingsRow> {
    const s = await this.repo.getSettings(userId);
    if (s) return s;
    // Default settings
    return {
      user_id: userId,
      privacy_last_seen: 'everyone',
      privacy_online: 'everyone',
      privacy_calls: 'everyone',
      privacy_groups: 'everyone',
      privacy_messages: 'everyone',
      notification_prefs: null,
    };
  }

  async updateSettings(userId: number, patch: Partial<UserSettingsRow>): Promise<UserSettingsRow> {
    await this.repo.upsertSettings(userId, patch);
    return this.getSettings(userId);
  }

  private toMe(row: UserRow): MeProfile {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      statusText: row.status_text,
      role: row.role,
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    };
  }
}
