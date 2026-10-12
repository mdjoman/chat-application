import type { FastifyInstance } from 'fastify';
import type { Socket } from 'socket.io';
import { z } from 'zod';

import type { SocketContext } from '../context.js';
import { MessagesService } from '../../modules/messages/messages.service.js';
import { ConversationsRepository } from '../../modules/conversations/conversations.repository.js';

const SendSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  type: z.enum(['text', 'image', 'video', 'audio', 'file', 'voice', 'system']).default('text'),
  content: z.string().max(8000).nullable().optional(),
  replyToId: z.coerce.number().int().positive().nullable().optional(),
  clientId: z.string().max(64).optional(),
  attachmentIds: z.array(z.coerce.number().int().positive()).max(5).optional(),
});

export async function registerMessageHandlers(
  app: FastifyInstance,
  socket: Socket,
  ctx: SocketContext,
): Promise<void> {
  const service = new MessagesService(app.db);
  const convos = new ConversationsRepository(app.db);

  const memberships: Array<{ conversation_id: number }> = await app
    .db('conversation_members')
    .where({ user_id: ctx.userId })
    .whereNull('left_at')
    .select('conversation_id');

  for (const m of memberships) socket.join(`t:${ctx.tenantId}:c:${m.conversation_id}`);

    socket.on('conversation:created', async (payload, ack) => {
    try {
      const { conversationId } = z
        .object({ conversationId: z.coerce.number().int().positive() })
        .parse(payload);
      const member = await convos.getMember(conversationId, ctx.userId);
      if (!member) return ack?.({ error: 'NOT_A_MEMBER' });
      socket.join(`t:${ctx.tenantId}:c:${conversationId}`);
      ack?.({ ok: true });
    } catch {
      ack?.({ error: 'INVALID_PAYLOAD' });
    }
  });

  socket.on('conversation:join', async (payload, ack) => {
    try {
      const { conversationId } = z.object({ conversationId: z.coerce.number().int().positive() }).parse(payload);
      const member = await convos.getMember(conversationId, ctx.userId);
      if (!member) return ack?.({ error: 'NOT_A_MEMBER' });
      socket.join(`t:${ctx.tenantId}:c:${conversationId}`);
      ack?.({ ok: true });
    } catch { ack?.({ error: 'INVALID_PAYLOAD' }); }
  });

  socket.on('conversation:leave', async (payload, ack) => {
    try {
      const { conversationId } = z.object({ conversationId: z.coerce.number().int().positive() }).parse(payload);
      socket.leave(`t:${ctx.tenantId}:c:${conversationId}`);
      ack?.({ ok: true });
    } catch { ack?.({ error: 'INVALID_PAYLOAD' }); }
  });

  socket.on('message:send', async (payload, ack) => {
    try {
      const parsed = SendSchema.parse(payload);
      const dto = await service.create({
        tenantId: ctx.tenantId,
        conversationId: parsed.conversationId,
        senderId: ctx.userId,
        type: parsed.type,
        content: parsed.content ?? null,
        replyToId: parsed.replyToId ?? null,
        attachmentIds: parsed.attachmentIds ?? [],
      });
      if (parsed.clientId) dto.clientId = parsed.clientId;
      const room = `t:${ctx.tenantId}:c:${parsed.conversationId}`;
      socket.to(room).emit('message:new', dto);
      socket.emit('message:new', dto);
      ack?.({ ok: true, message: dto });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'SEND_FAILED', message });
      socket.emit('error', { code: 'SEND_FAILED', message });
    }
  });

  socket.on('message:edit', async (payload, ack) => {
    try {
      const parsed = z.object({
        messageId: z.coerce.number().int().positive(),
        content: z.string().min(1).max(8000),
      }).parse(payload);
      const dto = await service.edit(ctx.tenantId, ctx.userId, parsed.messageId, parsed.content);
      const room = `t:${ctx.tenantId}:c:${dto.conversationId}`;
      socket.to(room).emit('message:updated', dto);
      socket.emit('message:updated', dto);
      ack?.({ ok: true, message: dto });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'EDIT_FAILED', message });
    }
  });

  socket.on('message:delete', async (payload, ack) => {
    try {
      const parsed = z.object({ messageId: z.coerce.number().int().positive() }).parse(payload);
      const row = await service.loadByIdOrThrow(ctx.tenantId, parsed.messageId);
      const conversationId = row.conversation_id;
      await service.delete(ctx.tenantId, ctx.userId, parsed.messageId);
      const out = { messageId: parsed.messageId, conversationId };
      const room = `t:${ctx.tenantId}:c:${conversationId}`;
      socket.to(room).emit('message:deleted', out);
      socket.emit('message:deleted', out);
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'DELETE_FAILED', message });
    }
  });

  socket.on('message:react', async (payload, ack) => {
    try {
      const parsed = z.object({
        messageId: z.coerce.number().int().positive(),
        reaction: z.string().min(1).max(16),
        added: z.boolean().default(true),
      }).parse(payload);
      const row = await service.loadByIdOrThrow(ctx.tenantId, parsed.messageId);
      const conversationId = row.conversation_id;
      if (parsed.added) await service.react(ctx.tenantId, ctx.userId, parsed.messageId, parsed.reaction);
      else await service.unreact(ctx.tenantId, ctx.userId, parsed.messageId, parsed.reaction);
      const out = { messageId: parsed.messageId, userId: ctx.userId, reaction: parsed.reaction, added: parsed.added };
      const room = `t:${ctx.tenantId}:c:${conversationId}`;
      socket.to(room).emit('message:reaction', out);
      socket.emit('message:reaction', out);
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'REACT_FAILED', message });
    }
  });

  socket.on('message:read', async (payload, ack) => {
    try {
      const parsed = z.object({
        conversationId: z.coerce.number().int().positive(),
        messageIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
      }).parse(payload);
      const ids = await service.markRead(ctx.tenantId, ctx.userId, parsed.conversationId, parsed.messageIds);
      const out = { conversationId: parsed.conversationId, userId: ctx.userId, messageIds: ids };
      const room = `t:${ctx.tenantId}:c:${parsed.conversationId}`;
      socket.to(room).emit('message:read', out);
      socket.emit('message:read', out);
      ack?.({ ok: true, messageIds: ids });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'READ_FAILED', message });
    }
  });
}
