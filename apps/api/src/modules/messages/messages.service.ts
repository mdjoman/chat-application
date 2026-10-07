import type { Knex } from 'knex';
import { randomUUID } from 'node:crypto';

import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { buildPage, decodeCursor, type CursorPage } from '../../utils/pagination.js';
import { ConversationsRepository } from '../conversations/conversations.repository.js';
import { MessagesRepository, type MessageRow } from './messages.repository.js';
import type { MessageDTO, MessageType } from '@chat/shared-types';

export interface CreateMessageInput {
  tenantId: number;
  conversationId: number;
  senderId: number;
  type?: MessageType;
  content?: string | null;
  replyToId?: number | null;
}

export class MessagesService {
  private readonly repo: MessagesRepository;
  private readonly convos: ConversationsRepository;

  constructor(private readonly db: Knex) {
    this.repo = new MessagesRepository(db);
    this.convos = new ConversationsRepository(db);
  }

  // ---------- Send ----------
  async create(input: CreateMessageInput): Promise<MessageDTO> {
    const member = await this.convos.getMember(input.conversationId, input.senderId);
    if (!member) throw new ForbiddenError('Not a member of this conversation');

    const type: MessageType = input.type ?? 'text';
    const content = (input.content ?? '').toString().slice(0, 8000);

    if (type === 'text' && content.trim().length === 0) {
      throw new ForbiddenError('Empty message');
    }

    if (input.replyToId) {
      const parent = await this.repo.findById(input.tenantId, input.replyToId);
      if (!parent || parent.conversation_id !== input.conversationId) {
        throw new NotFoundError('Reply target not found in this conversation');
      }
    }

    const messageUuid = randomUUID();

    // Everything the transaction needs is captured *before* the transaction
    // runs, so there is no reference to outer bindings from inside the callback.
    const tenantId = input.tenantId;
    const conversationId = input.conversationId;
    const senderId = input.senderId;
    const replyToId = input.replyToId ?? null;

    const newMessageId: number = await this.db.transaction(async (trx) => {
      const insertedId = await this.repo.insert(trx, {
        uuid: messageUuid,
        tenantId,
        conversationId,
        senderId,
        type,
        content: content.length > 0 ? content : null,
        replyToId,
      });

      // Bump the conversation's last_message_at
      await trx('conversations')
        .where({ tenant_id: tenantId, id: conversationId })
        .update({
          last_message_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      // Sender's own message status = read
      await this.repo.upsertStatus(trx, insertedId, senderId, 'read');

      // Everyone else gets 'sent' initially
      const members: Array<{ user_id: number }> = await trx('conversation_members')
        .where({ conversation_id: conversationId })
        .whereNull('left_at')
        .select('user_id');

      for (const m of members) {
        if (m.user_id === senderId) continue;
        await this.repo.upsertStatus(trx, insertedId, m.user_id, 'sent');
      }

      return insertedId;
    });

    const row = await this.repo.findById(tenantId, newMessageId);
    if (!row) throw new Error('Message vanished after insert');
    return this.toDTO(row);
  }

  // ---------- History ----------
  async history(
    tenantId: number,
    userId: number,
    conversationId: number,
    limit = 30,
    cursor?: string,
  ): Promise<CursorPage<MessageDTO>> {
    const member = await this.convos.getMember(conversationId, userId);
    if (!member) throw new ForbiddenError('Not a member');

    const cursorId = cursor ? Number(decodeCursor(cursor)) : null;
    const rows = await this.repo.listByConversation(tenantId, conversationId, limit, cursorId);
    const page = buildPage(rows, limit);

    const ids = page.items.map((r) => r.id);
    const reactions = await this.repo.reactionsFor(ids);
    const attachments = await this.repo.attachmentsFor(ids);

    const reactionMap = new Map<number, MessageDTO['reactions']>();
    for (const r of reactions) {
      const arr = reactionMap.get(r.message_id) ?? [];
      arr.push({
        reaction: r.reaction,
        userId: r.user_id,
        createdAt: new Date(r.created_at).toISOString(),
      });
      reactionMap.set(r.message_id, arr);
    }

    const attachMap = new Map<number, MessageDTO['attachments']>();
    for (const a of attachments) {
      if (a.message_id == null) continue;
      const arr = attachMap.get(a.message_id) ?? [];
      arr.push({
        id: a.id,
        messageId: a.message_id,
        mimeType: a.mime_type,
        sizeBytes: Number(a.size_bytes),
        originalName: a.original_name,
        url: `/api/v1/attachments/${a.id}`,
        metadata: (a.metadata as Record<string, unknown>) ?? null,
      });
      attachMap.set(a.message_id, arr);
    }

    return {
      ...page,
      items: page.items.map((r) =>
        this.toDTO(r, reactionMap.get(r.id), attachMap.get(r.id)),
      ),
    };
  }

  // ---------- Search ----------
  async search(
    tenantId: number,
    userId: number,
    conversationId: number,
    term: string,
    limit = 30,
  ): Promise<MessageDTO[]> {
    const member = await this.convos.getMember(conversationId, userId);
    if (!member) throw new ForbiddenError('Not a member');
    const rows = await this.repo.search(tenantId, conversationId, term, Math.min(limit, 50));
    return rows.map((r) => this.toDTO(r));
  }

  // ---------- Edit ----------
  async edit(
    tenantId: number,
    userId: number,
    messageId: number,
    content: string,
  ): Promise<MessageDTO> {
    const row = await this.repo.findById(tenantId, messageId);
    if (!row) throw new NotFoundError('Message not found');
    if (row.sender_id !== userId) throw new ForbiddenError('Only the sender can edit');
    if (row.deleted_at) throw new ForbiddenError('Cannot edit a deleted message');

    const cleaned = content.slice(0, 8000);
    await this.db.transaction(async (trx) => {
      await this.repo.updateContent(trx, tenantId, messageId, cleaned);
    });
    const fresh = await this.repo.findById(tenantId, messageId);
    if (!fresh) throw new NotFoundError('Message not found after update');
    return this.toDTO(fresh);
  }

  // ---------- Delete ----------
  async delete(tenantId: number, userId: number, messageId: number): Promise<void> {
    const row = await this.repo.findById(tenantId, messageId);
    if (!row) throw new NotFoundError('Message not found');

    const member = await this.convos.getMember(row.conversation_id, userId);
    if (!member) throw new ForbiddenError('Not a member');

    const isSender = row.sender_id === userId;
    const isGroupModerator = member.role === 'owner' || member.role === 'admin';

    if (!isSender && !isGroupModerator) {
      throw new ForbiddenError('Not allowed to delete this message');
    }

    await this.db.transaction(async (trx) => {
      await this.repo.softDelete(trx, tenantId, messageId, userId);
    });
  }

  // ---------- Reactions ----------
  async react(
    tenantId: number,
    userId: number,
    messageId: number,
    reaction: string,
  ): Promise<void> {
    const row = await this.repo.findById(tenantId, messageId);
    if (!row) throw new NotFoundError('Message not found');
    const member = await this.convos.getMember(row.conversation_id, userId);
    if (!member) throw new ForbiddenError('Not a member');

    const trimmed = reaction.trim().slice(0, 16);
    if (!trimmed) throw new ForbiddenError('Empty reaction');

    await this.db.transaction(async (trx) => {
      await this.repo.addReaction(trx, messageId, userId, trimmed);
    });
  }

  async unreact(
    tenantId: number,
    userId: number,
    messageId: number,
    reaction: string,
  ): Promise<void> {
    const row = await this.repo.findById(tenantId, messageId);
    if (!row) throw new NotFoundError('Message not found');
    const member = await this.convos.getMember(row.conversation_id, userId);
    if (!member) throw new ForbiddenError('Not a member');

    const trimmed = reaction.trim().slice(0, 16);
    await this.db.transaction(async (trx) => {
      await this.repo.removeReaction(trx, messageId, userId, trimmed);
    });
  }

  // ---------- Read receipts ----------
  async markRead(
    tenantId: number,
    userId: number,
    conversationId: number,
    messageIds: number[],
  ): Promise<number[]> {
    const member = await this.convos.getMember(conversationId, userId);
    if (!member) throw new ForbiddenError('Not a member');

    const rows = await this.repo.findByIds(tenantId, messageIds);
    const validIds = rows
      .filter((r) => r.conversation_id === conversationId)
      .map((r) => r.id);
    if (validIds.length === 0) return [];

    await this.db.transaction(async (trx) => {
      await this.repo.markRead(trx, validIds, userId);
      await trx('conversation_members')
        .where({ conversation_id: conversationId, user_id: userId })
        .update({ last_read_at: trx.fn.now() });
    });
    return validIds;
  }

  // ---------- Helpers ----------
  async loadByIdOrThrow(tenantId: number, messageId: number): Promise<MessageRow> {
    const row = await this.repo.findById(tenantId, messageId);
    if (!row) throw new NotFoundError('Message not found');
    return row;
  }

  async toDTO(
    row: MessageRow,
    reactions?: MessageDTO['reactions'],
    attachments?: MessageDTO['attachments'],
  ): Promise<MessageDTO> {
    return {
      id: row.id,
      uuid: row.uuid,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      type: row.type,
      content: row.deleted_at ? null : row.content,
      replyToId: row.reply_to_id,
      forwardedFromId: row.forwarded_from_id,
      editedAt: row.edited_at ? new Date(row.edited_at).toISOString() : null,
      deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      reactions,
      attachments,
    };
  }
}
