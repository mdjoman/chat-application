import type { Knex } from 'knex';

export interface ConversationRow {
  id: number;
  tenant_id: number;
  type: 'direct' | 'group';
  name: string | null;
  avatar_url: string | null;
  created_by: number | null;
  direct_key: string | null;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface MemberRow {
  id: number;
  conversation_id: number;
  user_id: number;
  role: 'owner' | 'admin' | 'member';
  joined_at: Date;
  left_at: Date | null;
  last_read_at: Date | null;
  muted_until: Date | null;
}

export class ConversationsRepository {
  constructor(private readonly db: Knex) {}

  async findById(tenantId: number, id: number): Promise<ConversationRow | undefined> {
    return this.db('conversations').where({ tenant_id: tenantId, id }).first();
  }

  async findDirectByKey(tenantId: number, key: string): Promise<ConversationRow | undefined> {
    return this.db('conversations')
      .where({ tenant_id: tenantId, direct_key: key })
      .first();
  }

  async create(
    trx: Knex.Transaction,
    input: {
      tenantId: number;
      type: 'direct' | 'group';
      name?: string | null;
      avatarUrl?: string | null;
      createdBy: number;
      directKey?: string | null;
    },
  ): Promise<number> {
    const [id] = await trx('conversations').insert({
      tenant_id: input.tenantId,
      type: input.type,
      name: input.name ?? null,
      avatar_url: input.avatarUrl ?? null,
      created_by: input.createdBy,
      direct_key: input.directKey ?? null,
    });
    return Number(id);
  }

  async addMember(
    trx: Knex.Transaction,
    input: {
      conversationId: number;
      userId: number;
      role: 'owner' | 'admin' | 'member';
    },
  ): Promise<void> {
    await trx('conversation_members')
      .insert({
        conversation_id: input.conversationId,
        user_id: input.userId,
        role: input.role,
      })
      .onConflict(['conversation_id', 'user_id'])
      .merge({ left_at: null, role: input.role });
  }

  async listMembers(conversationId: number): Promise<MemberRow[]> {
    return this.db('conversation_members')
      .where({ conversation_id: conversationId })
      .whereNull('left_at');
  }

  async isMember(conversationId: number, userId: number): Promise<boolean> {
    const row = await this.db('conversation_members')
      .where({ conversation_id: conversationId, user_id: userId })
      .whereNull('left_at')
      .first();
    return Boolean(row);
  }

  async getMember(conversationId: number, userId: number): Promise<MemberRow | undefined> {
    return this.db('conversation_members')
      .where({ conversation_id: conversationId, user_id: userId })
      .whereNull('left_at')
      .first();
  }

  async removeMember(
    trx: Knex.Transaction,
    conversationId: number,
    userId: number,
  ): Promise<void> {
    await trx('conversation_members')
      .where({ conversation_id: conversationId, user_id: userId })
      .update({ left_at: trx.fn.now() });
  }

  async updateMemberRole(
    trx: Knex.Transaction,
    conversationId: number,
    userId: number,
    role: 'owner' | 'admin' | 'member',
  ): Promise<void> {
    await trx('conversation_members')
      .where({ conversation_id: conversationId, user_id: userId })
      .update({ role });
  }

  async listForUser(
    tenantId: number,
    userId: number,
    limit: number,
    cursorId: number | null,
  ): Promise<Array<ConversationRow & { last_read_at: Date | null; role: string; unread_count?: number }>> {
    const q = this.db('conversations as c')
      .join('conversation_members as m', 'm.conversation_id', 'c.id')
      .where('c.tenant_id', tenantId)
      .where('m.user_id', userId)
      .whereNull('m.left_at')
      .select(
        'c.*',
        'm.last_read_at as last_read_at',
        'm.role as role',
      )
      .orderBy('c.last_message_at', 'desc')
      .orderBy('c.id', 'desc')
      .limit(limit + 1);

    if (cursorId) q.andWhere('c.id', '<', cursorId);
    return q;
  }

  async updateConversation(
    tenantId: number,
    id: number,
    patch: { name?: string | null; avatar_url?: string | null },
  ): Promise<void> {
    const clean: Record<string, unknown> = {};
    if (patch.name !== undefined) clean.name = patch.name;
    if (patch.avatar_url !== undefined) clean.avatar_url = patch.avatar_url;
    if (Object.keys(clean).length === 0) return;
    clean.updated_at = this.db.fn.now();
    await this.db('conversations').where({ tenant_id: tenantId, id }).update(clean);
  }
}
