import type { Knex } from 'knex';
import type { MessageType } from '@chat/shared-types';

export interface MessageRow {
  id: number;
  uuid: string;
  tenant_id: number;
  conversation_id: number;
  sender_id: number | null;
  type: MessageType;
  content: string | null;
  reply_to_id: number | null;
  forwarded_from_id: number | null;
  edited_at: Date | null;
  deleted_at: Date | null;
  deleted_by: number | null;
  created_at: Date;
}

export interface ReactionRow {
  id: number;
  message_id: number;
  user_id: number;
  reaction: string;
  created_at: Date;
}

export interface AttachmentRow {
  id: number;
  message_id: number | null;
  tenant_id: number;
  uploaded_by: number | null;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  original_name: string | null;
  metadata: unknown;
  created_at: Date;
}

export class MessagesRepository {
  constructor(private readonly db: Knex) {}

  /**
   * Insert one message inside a transaction.
   * Returns the numeric auto-increment id.
   */
  async insert(
    trx: Knex.Transaction,
    input: {
      uuid: string;
      tenantId: number;
      conversationId: number;
      senderId: number | null;
      type: MessageType;
      content: string | null;
      replyToId: number | null;
      forwardedFromId?: number | null;
    },
  ): Promise<number> {
    const result = await trx('messages').insert({
      uuid: input.uuid,
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      type: input.type,
      content: input.content,
      reply_to_id: input.replyToId,
      forwarded_from_id: input.forwardedFromId ?? null,
    });

    // Knex/mysql2 returns `[insertId]` for a single insert.
    // Guard against any driver returning a non-array or a BigInt.
    const rawId = Array.isArray(result) ? result[0] : result;
    const numericId = Number(rawId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      throw new Error(`messages.insert: unexpected insert id: ${String(rawId)}`);
    }
    return numericId;
  }

  async findById(tenantId: number, messageId: number): Promise<MessageRow | undefined> {
    return this.db('messages').where({ tenant_id: tenantId, id: messageId }).first();
  }

  async findByIds(tenantId: number, messageIds: number[]): Promise<MessageRow[]> {
    if (messageIds.length === 0) return [];
    return this.db('messages')
      .where({ tenant_id: tenantId })
      .whereIn('id', messageIds);
  }

  async listByConversation(
    tenantId: number,
    conversationId: number,
    limit: number,
    cursorId: number | null,
  ): Promise<MessageRow[]> {
    const q = this.db('messages')
      .where({ tenant_id: tenantId, conversation_id: conversationId })
      .orderBy('id', 'desc')
      .limit(limit + 1);
    if (cursorId) q.andWhere('id', '<', cursorId);
    return q;
  }

  async search(
    tenantId: number,
    conversationId: number,
    term: string,
    limit: number,
  ): Promise<MessageRow[]> {
    const like = `%${term.replace(/[%_]/g, (m) => '\\' + m)}%`;
    return this.db('messages')
      .where({ tenant_id: tenantId, conversation_id: conversationId })
      .whereNull('deleted_at')
      .andWhere('content', 'like', like)
      .orderBy('id', 'desc')
      .limit(limit);
  }

  async updateContent(
    trx: Knex.Transaction,
    tenantId: number,
    messageId: number,
    content: string,
  ): Promise<void> {
    await trx('messages')
      .where({ tenant_id: tenantId, id: messageId })
      .update({ content, edited_at: trx.fn.now() });
  }

  async softDelete(
    trx: Knex.Transaction,
    tenantId: number,
    messageId: number,
    byUserId: number,
  ): Promise<void> {
    await trx('messages')
      .where({ tenant_id: tenantId, id: messageId })
      .update({
        deleted_at: trx.fn.now(),
        deleted_by: byUserId,
        content: null,
      });
  }

  // --- Reactions ---
  async addReaction(
    trx: Knex.Transaction,
    messageId: number,
    userId: number,
    reaction: string,
  ): Promise<void> {
    await trx('message_reactions')
      .insert({ message_id: messageId, user_id: userId, reaction })
      .onConflict(['message_id', 'user_id', 'reaction'])
      .ignore();
  }

  async removeReaction(
    trx: Knex.Transaction,
    messageId: number,
    userId: number,
    reaction: string,
  ): Promise<void> {
    await trx('message_reactions')
      .where({ message_id: messageId, user_id: userId, reaction })
      .delete();
  }

  async reactionsFor(messageIds: number[]): Promise<ReactionRow[]> {
    if (messageIds.length === 0) return [];
    return this.db('message_reactions').whereIn('message_id', messageIds);
  }

  // --- Status (sent/delivered/read) ---
  async upsertStatus(
    trx: Knex.Transaction,
    messageId: number,
    userId: number,
    status: 'sent' | 'delivered' | 'read',
  ): Promise<void> {
    await trx('message_status')
      .insert({ message_id: messageId, user_id: userId, status })
      .onConflict(['message_id', 'user_id'])
      .merge({ status, updated_at: trx.fn.now() });
  }

  async markRead(
    trx: Knex.Transaction,
    messageIds: number[],
    userId: number,
  ): Promise<void> {
    if (messageIds.length === 0) return;
    const rows = messageIds.map((mid) => ({
      message_id: mid,
      user_id: userId,
      status: 'read' as const,
    }));
    await trx('message_status')
      .insert(rows)
      .onConflict(['message_id', 'user_id'])
      .merge({ status: 'read', updated_at: trx.fn.now() });
  }

  // --- Attachments ---
  async attachmentsFor(messageIds: number[]): Promise<AttachmentRow[]> {
    if (messageIds.length === 0) return [];
    return this.db('attachments').whereIn('message_id', messageIds);
  }
}
