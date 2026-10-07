import type { Knex } from 'knex';

export interface UserRow {
  id: number;
  tenant_id: number;
  external_id: string | null;
  username: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  status_text: string | null;
  role: string;
  last_seen_at: Date | null;
  is_active: 0 | 1;
  created_at: Date;
  updated_at: Date;
}

export interface UserSettingsRow {
  user_id: number;
  privacy_last_seen: string;
  privacy_online: string;
  privacy_calls: string;
  privacy_groups: string;
  privacy_messages: string;
  notification_prefs: unknown | null;
}

export class UsersRepository {
  constructor(private readonly db: Knex) {}

  async findById(tenantId: number, userId: number): Promise<UserRow | undefined> {
    return this.db('users').where({ tenant_id: tenantId, id: userId }).first();
  }

  async findByExternalId(tenantId: number, externalId: string): Promise<UserRow | undefined> {
    return this.db('users').where({ tenant_id: tenantId, external_id: externalId }).first();
  }

  async search(tenantId: number, q: string, limit: number, offset: number): Promise<UserRow[]> {
    const like = `%${q.replace(/[%_]/g, (m) => '\\' + m)}%`;
    return this.db('users')
      .where({ tenant_id: tenantId, is_active: 1 })
      .andWhere((b) =>
        b.where('username', 'like', like).orWhere('display_name', 'like', like),
      )
      .orderBy('display_name', 'asc')
      .limit(limit)
      .offset(offset);
  }

  async getSettings(userId: number): Promise<UserSettingsRow | undefined> {
    return this.db('user_settings').where({ user_id: userId }).first();
  }

  async upsertSettings(userId: number, patch: Partial<UserSettingsRow>): Promise<void> {
    const existing = await this.getSettings(userId);
    if (!existing) {
      await this.db('user_settings').insert({
        user_id: userId,
        ...patch,
        updated_at: this.db.fn.now(),
      });
    } else {
      await this.db('user_settings')
        .where({ user_id: userId })
        .update({ ...patch, updated_at: this.db.fn.now() });
    }
  }

  async updateProfile(
    tenantId: number,
    userId: number,
    patch: { display_name?: string; avatar_url?: string | null; status_text?: string | null },
  ): Promise<void> {
    const clean: Record<string, unknown> = {};
    if (patch.display_name !== undefined) clean.display_name = patch.display_name;
    if (patch.avatar_url !== undefined) clean.avatar_url = patch.avatar_url;
    if (patch.status_text !== undefined) clean.status_text = patch.status_text;
    if (Object.keys(clean).length === 0) return;
    clean.updated_at = this.db.fn.now();
    await this.db('users').where({ tenant_id: tenantId, id: userId }).update(clean);
  }
}
