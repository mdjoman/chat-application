import type { FastifyInstance } from 'fastify';
import type { Socket } from 'socket.io';
import { z } from 'zod';

import type { SocketContext } from '../context.js';
import { ConversationsRepository } from '../../modules/conversations/conversations.repository.js';

const TYPING_TTL = 6; // seconds

const PayloadSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
});

export async function registerTypingHandlers(
  app: FastifyInstance,
  socket: Socket,
  ctx: SocketContext,
): Promise<void> {
  const convos = new ConversationsRepository(app.db);
  const redis = app.redis;

  const broadcast = async (conversationId: number, isTyping: boolean) => {
    const key = `typing:${conversationId}:${ctx.userId}`;
    if (isTyping) {
      await redis.set(key, '1', 'EX', TYPING_TTL);
    } else {
      await redis.del(key);
    }
    socket
      .to(`t:${ctx.tenantId}:c:${conversationId}`)
      .emit('typing:update', {
        conversationId,
        userId: ctx.userId,
        isTyping,
      });
  };

  socket.on('typing:start', async (payload, ack) => {
    try {
      const { conversationId } = PayloadSchema.parse(payload);
      const member = await convos.getMember(conversationId, ctx.userId);
      if (!member) return ack?.({ error: 'NOT_A_MEMBER' });
      await broadcast(conversationId, true);
      ack?.({ ok: true });
    } catch {
      ack?.({ error: 'INVALID_PAYLOAD' });
    }
  });

  socket.on('typing:stop', async (payload, ack) => {
    try {
      const { conversationId } = PayloadSchema.parse(payload);
      const member = await convos.getMember(conversationId, ctx.userId);
      if (!member) return ack?.({ error: 'NOT_A_MEMBER' });
      await broadcast(conversationId, false);
      ack?.({ ok: true });
    } catch {
      ack?.({ error: 'INVALID_PAYLOAD' });
    }
  });

  socket.on('disconnect', async () => {
    // Best-effort cleanup of typing flags is handled by Redis TTL.
  });
}
