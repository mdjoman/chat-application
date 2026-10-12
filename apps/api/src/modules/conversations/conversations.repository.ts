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

export interface LatestMessage {
  conversation_id: number;
  id: number;
  sender_id: number | null;
  type: string;
  content: string | null;
  deleted_at: Date | null;
  created_at: Date;
}

export class ConversationsRepository {
  constructor(private readonly db: Knex) {}

  async findById(tenantId: number, id: number): Promise<ConversationRow | undefined> {
    return this.db('conversations').where({ tenant_id: tenantId, id }).first();
  }

  async findDirectByKey(tenantId: number, key: string): Promise<ConversationRow | undefined> {
    return this.db('conversations').where({ tenant_id: tenantId, direct_key: key }).first();
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
    const result = await trx('conversations').insert({
      tenant_id: input.tenantId,
      type: input.type,
      name: input.name ?? null,
      avatar_url: input.avatarUrl ?? null,
      created_by: input.createdBy,
      direct_key: input.directKey ?? null,
    });
    const rawId = Array.isArray(result) ? result[0] : result;
    return Number(rawId);
  }

  async addMember(
    trx: Knex.Transaction,
    input: { conversationId: number; userId: number; role: 'owner' | 'admin' | 'member' },
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

  async getMemberHistory(conversationId: number, userId: number): Promise<MemberRow | undefined> {
    return this.db('conversation_members')
      .where({ conversation_id: conversationId, user_id: userId })
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
  ): Promise<Array<ConversationRow & { last_read_at: Date | null; role: string }>> {
    const q = this.db('conversations as c')
      .join('conversation_members as m', 'm.conversation_id', 'c.id')
      .where('c.tenant_id', tenantId)
      .where('m.user_id', userId)
      .whereNull('m.left_at')
      .select('c.*', 'm.last_read_at as last_read_at', 'm.role as role')
      .orderBy('c.last_message_at', 'desc')
      .orderBy('c.id', 'desc')
      .limit(limit + 1);

    if (cursorId) q.andWhere('c.id', '<', cursorId);
    return q;
  }


  async latestMessagesForConversations(
    tenantId: number,
    conversationIds: number[],
  ): Promise<Map<number, LatestMessage>> {
    const map = new Map<number, LatestMessage>();

    if (conversationIds.length === 0) return map;

    // Build a subquery to rank messages within each conversation.
    const ranked = this.db('messages')
      .select(
        'id',
        'conversation_id',
        'sender_id',
        'type',
        'content',
        'deleted_at',
        'created_at',
      )
      .select(
        this.db.raw(
          'ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY id DESC) AS rn',
        ),
      )
      .whereIn('conversation_id', conversationIds)
      .where('tenant_id', tenantId)
      .as('ranked');

    // Get the latest message from each conversation.
    const rows = await this.db
      .from<LatestMessage & { rn: number }>(ranked)
      .select('*')
      .where('rn', 1);

    for (const r of rows) {
      map.set(r.conversation_id, {
        conversation_id: r.conversation_id,
        id: r.id,
        sender_id: r.sender_id,
        type: r.type,
        content: r.content,
        deleted_at: r.deleted_at,
        created_at: r.created_at,
      });
    }

    return map;
  }


  /** Resolve multiple users (for names) in one query. */
  async usersByIds(
    tenantId: number,
    userIds: number[],
  ): Promise<Array<{ id: number; username: string; display_name: string; avatar_url: string | null }>> {
    if (userIds.length === 0) return [];
    return this.db('users')
      .where({ tenant_id: tenantId })
      .whereIn('id', userIds)
      .select('id', 'username', 'display_name', 'avatar_url');
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

  async touch(
    trx: Knex.Transaction,
    tenantId: number,
    conversationId: number,
  ): Promise<void> {
    await trx('conversations')
      .where({ tenant_id: tenantId, id: conversationId })
      .update({ last_message_at: trx.fn.now(), updated_at: trx.fn.now() });
  }
}
