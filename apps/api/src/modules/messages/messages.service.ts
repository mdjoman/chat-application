import type { Knex } from 'knex';
import { randomUUID } from 'node:crypto';

import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { buildPage, decodeCursor, type CursorPage } from '../../utils/pagination.js';
import { ConversationsRepository } from '../conversations/conversations.repository.js';
import { MessagesRepository, type MessageRow } from './messages.repository.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import type { MessageDTO, MessageType } from '@chat/shared-types';

export interface CreateMessageInput {
  tenantId: number;
  conversationId: number;
  senderId: number;
  type?: MessageType;
  content?: string | null;
  replyToId?: number | null;
  attachmentIds?: number[];
}

export class MessagesService {
  private readonly repo: MessagesRepository;
  private readonly convos: ConversationsRepository;
  private readonly attachments: AttachmentsService;

  constructor(private readonly db: Knex) {
    this.repo = new MessagesRepository(db);
    this.convos = new ConversationsRepository(db);
    this.attachments = new AttachmentsService(db);
  }

  async create(input: CreateMessageInput): Promise<MessageDTO> {
    const member = await this.convos.getMember(input.conversationId, input.senderId);
    if (!member) throw new ForbiddenError('Not a member of this conversation');

    const type: MessageType = input.type ?? 'text';
    const content = (input.content ?? '').toString().slice(0, 8000);
    const attachmentIds = input.attachmentIds ?? [];

    if (type === 'text' && content.trim().length === 0 && attachmentIds.length === 0) {
      throw new ForbiddenError('Empty message');
    }
    if (attachmentIds.length > 5) throw new ForbiddenError('Too many attachments');

    if (input.replyToId) {
      const parent = await this.repo.findById(input.tenantId, input.replyToId);
      if (!parent || parent.conversation_id !== input.conversationId) {
        throw new NotFoundError('Reply target not found in this conversation');
      }
    }

    const messageUuid = randomUUID();
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

      if (attachmentIds.length > 0) {
        await this.attachments.attachToMessage(trx, tenantId, insertedId, attachmentIds);
      }

      await trx('conversations')
        .where({ tenant_id: tenantId, id: conversationId })
        .update({ last_message_at: trx.fn.now(), updated_at: trx.fn.now() });

      await this.repo.upsertStatus(trx, insertedId, senderId, 'read');

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
    const attachMap = await this.attachments.loadForMessages(tenantId, [newMessageId]);
    return this.toDTO(row, undefined, attachMap.get(newMessageId) ?? []);
  }

    async history(
    tenantId: number,
    userId: number,
    conversationId: number,
    limit = 30,
    cursor?: string,
  ): Promise<CursorPage<MessageDTO>> {
    // Any member who has *ever* been in the conversation (even left)
    // can read messages sent while they were a member.
    // New members added later can read history from the conversation's start.
    // If you want to restrict new members to only messages after they joined,
    // replace getMember with getMemberHistory and filter by `joined_at`.
    const member = await this.convos.getMember(conversationId, userId);
    const historical = member ?? (await this.convos.getMemberHistory(conversationId, userId));
    if (!historical) throw new ForbiddenError('Not a member');

    const cursorId = cursor ? Number(decodeCursor(cursor)) : null;
    const rows = await this.repo.listByConversation(tenantId, conversationId, limit, cursorId);
    const page = buildPage(rows, limit);

    const ids = page.items.map((r) => r.id);
    const reactions = await this.repo.reactionsFor(ids);
    const attachMap = await this.attachments.loadForMessages(tenantId, ids);

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

    return {
      ...page,
      items: page.items.map((r) =>
        this.toDTO(r, reactionMap.get(r.id), attachMap.get(r.id)),
      ),
    };
  }

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

    await this.db.transaction(async (trx) => {
      await this.repo.removeReaction(trx, messageId, userId, reaction.trim().slice(0, 16));
    });
  }

    async markRead(
    tenantId: number,
    userId: number,
    conversationId: number,
    messageIds: number[],
  ): Promise<number[]> {
    // Allow both current and historical members (users who left still
    // have their membership row). If neither exists, silently return [] —
    // this prevents stale sockets from throwing 403s into the widget.
    const active = await this.convos.getMember(conversationId, userId);
    const historical = active ?? (await this.convos.getMemberHistory(conversationId, userId));
    if (!historical) return [];

    const rows = await this.repo.findByIds(tenantId, messageIds);
    const validIds = rows
      .filter((r) => r.conversation_id === conversationId)
      .map((r) => r.id);
    if (validIds.length === 0) return [];

    await this.db.transaction(async (trx) => {
      await this.repo.markRead(trx, validIds, userId);
      // Only update last_read_at for members who haven't left.
      await trx('conversation_members')
        .where({ conversation_id: conversationId, user_id: userId })
        .whereNull('left_at')
        .update({ last_read_at: trx.fn.now() });
    });
    return validIds;
  }

  async loadByIdOrThrow(tenantId: number, messageId: number): Promise<MessageRow> {
    const row = await this.repo.findById(tenantId, messageId);
    if (!row) throw new NotFoundError('Message not found');
    return row;
  }

    toDTO(row: MessageRow, reactions?: MessageDTO['reactions'], attachments?: MessageDTO['attachments']): MessageDTO {
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
      pinnedAt: row.pinned_at ? new Date(row.pinned_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      reactions,
      attachments,
    };
  }

    async pin(
    tenantId: number,
    userId: number,
    messageId: number,
    pinned: boolean,
  ): Promise<MessageDTO> {
    const row = await this.repo.findById(tenantId, messageId);
    if (!row) throw new NotFoundError('Message not found');

    const member = await this.convos.getMember(row.conversation_id, userId);
    if (!member) throw new ForbiddenError('Not a member');

    await this.db.transaction(async (trx) => {
      await this.repo.setPinned(trx, tenantId, messageId, pinned ? userId : null);
    });

    const fresh = await this.repo.findById(tenantId, messageId);
    if (!fresh) throw new NotFoundError('Message not found after update');
    return this.toDTO(fresh);
  }

  async listPinned(tenantId: number, userId: number, conversationId: number): Promise<MessageDTO[]> {
    const member = await this.convos.getMember(conversationId, userId);
    if (!member) throw new ForbiddenError('Not a member');
    const rows = await this.repo.listPinned(tenantId, conversationId);
    return rows.map((r) => this.toDTO(r));
  }

  async forward(
    tenantId: number,
    userId: number,
    messageId: number,
    targetConversationIds: number[],
  ): Promise<MessageDTO[]> {
    const source = await this.repo.findById(tenantId, messageId);
    if (!source) throw new NotFoundError('Message not found');

    const sourceMember = await this.convos.getMember(source.conversation_id, userId);
    if (!sourceMember) throw new ForbiddenError('Not a member of source conversation');

    const created: MessageDTO[] = [];
    for (const targetId of targetConversationIds) {
      const targetMember = await this.convos.getMember(targetId, userId);
      if (!targetMember) continue; // skip silently for non-members

      const dto = await this.create({
        tenantId,
        conversationId: targetId,
        senderId: userId,
        type: source.type,
        content: source.content,
        replyToId: null,
        attachmentIds: [],
      });

      // Mark as forwarded
      await this.db('messages')
        .where({ tenant_id: tenantId, id: dto.id })
        .update({ forwarded_from_id: source.id });

      dto.forwardedFromId = source.id;
      created.push(dto);
    }
    return created;
  }
}
