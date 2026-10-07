import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../../middleware/authenticate.js';
import { TokenService } from '../auth/token.service.js';
import { MessagesService } from './messages.service.js';
import { getIO } from '../../sockets/io.js';
import {
  ConversationIdParamSchema,
  EditMessageSchema,
  HistoryQuerySchema,
  IdParamSchema,
  ReactionSchema,
  ReadSchema,
  SearchQuerySchema,
  SendMessageSchema,
} from './messages.schemas.js';

const messagesRoutes: FastifyPluginAsync = async (fastify) => {
  const tokens = new TokenService(fastify.db, fastify.redis);
  const service = new MessagesService(fastify.db);
  const auth = authenticate(tokens);

  // --- History (cursor-paginated) ---
  fastify.get(
    '/conversations/:conversationId/messages',
    { preHandler: auth },
    async (req) => {
      const { userId, tenantId } = req.auth!;
      const { conversationId } = ConversationIdParamSchema.parse(req.params);
      const { limit, cursor } = HistoryQuerySchema.parse(req.query);
      return service.history(tenantId, userId, conversationId, limit, cursor);
    },
  );

  // --- Search within a conversation ---
  fastify.get(
    '/conversations/:conversationId/messages/search',
    { preHandler: auth },
    async (req) => {
      const { userId, tenantId } = req.auth!;
      const { conversationId } = ConversationIdParamSchema.parse(req.params);
      const { q, limit } = SearchQuerySchema.parse(req.query);
      const items = await service.search(tenantId, userId, conversationId, q, limit);
      return { items };
    },
  );

  // --- Send (REST fallback; primary path is Socket.IO) ---
  fastify.post(
    '/conversations/:conversationId/messages',
    { preHandler: auth },
    async (req, reply) => {
      const { userId, tenantId } = req.auth!;
      const { conversationId } = ConversationIdParamSchema.parse(req.params);
      const body = SendMessageSchema.parse(req.body);

      const dto = await service.create({
        tenantId,
        conversationId,
        senderId: userId,
        type: body.type,
        content: body.content,
        replyToId: body.replyToId ?? null,
      });

      if (body.clientId) dto.clientId = body.clientId;

      try {
        const io = getIO();
        io.to(`t:${tenantId}:c:${conversationId}`).emit('message:new', dto);
      } catch {
        /* io not initialised (tests) */
      }

      return reply.status(201).send(dto);
    },
  );

  // --- Edit ---
  fastify.patch('/messages/:id', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);
    const { content } = EditMessageSchema.parse(req.body);

    const dto = await service.edit(tenantId, userId, id, content);

    try {
      const io = getIO();
      io.to(`t:${tenantId}:c:${dto.conversationId}`).emit('message:updated', dto);
    } catch {
      /* noop */
    }
    return dto;
  });

  // --- Delete ---
  fastify.delete('/messages/:id', { preHandler: auth }, async (req, reply) => {
    const { userId, tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);

    // Load first so we still know the conversation for broadcasting.
    const row = await service.loadByIdOrThrow(tenantId, id);
    const conversationId = row.conversation_id;

    await service.delete(tenantId, userId, id);

    try {
      const io = getIO();
      io.to(`t:${tenantId}:c:${conversationId}`).emit('message:deleted', {
        messageId: id,
        conversationId,
      });
    } catch {
      /* noop */
    }
    return reply.status(204).send();
  });

  // --- Reaction add ---
  fastify.post('/messages/:id/reactions', { preHandler: auth }, async (req, reply) => {
    const { userId, tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);
    const { reaction } = ReactionSchema.parse(req.body);

    const row = await service.loadByIdOrThrow(tenantId, id);
    const conversationId = row.conversation_id;

    await service.react(tenantId, userId, id, reaction);

    try {
      const io = getIO();
      io.to(`t:${tenantId}:c:${conversationId}`).emit('message:reaction', {
        messageId: id,
        userId,
        reaction,
        added: true,
      });
    } catch {
      /* noop */
    }
    return reply.status(204).send();
  });

  // --- Reaction remove ---
  fastify.delete(
    '/messages/:id/reactions/:reaction',
    { preHandler: auth },
    async (req, reply) => {
      const { userId, tenantId } = req.auth!;
      const { id } = IdParamSchema.parse(req.params);
      const params = z.object({ reaction: z.string().min(1).max(16) }).parse(req.params);

      const row = await service.loadByIdOrThrow(tenantId, id);
      const conversationId = row.conversation_id;

      await service.unreact(tenantId, userId, id, params.reaction);

      try {
        const io = getIO();
        io.to(`t:${tenantId}:c:${conversationId}`).emit('message:reaction', {
          messageId: id,
          userId,
          reaction: params.reaction,
          added: false,
        });
      } catch {
        /* noop */
      }
      return reply.status(204).send();
    },
  );

  // --- Read receipts ---
  fastify.post(
    '/conversations/:conversationId/read',
    { preHandler: auth },
    async (req, reply) => {
      const { userId, tenantId } = req.auth!;
      const { conversationId } = ConversationIdParamSchema.parse(req.params);
      const { messageIds } = ReadSchema.parse(req.body);

      const readIds = await service.markRead(tenantId, userId, conversationId, messageIds);

      try {
        const io = getIO();
        io.to(`t:${tenantId}:c:${conversationId}`).emit('message:read', {
          conversationId,
          userId,
          messageIds: readIds,
        });
      } catch {
        /* noop */
      }
      return reply.status(204).send();
    },
  );
};

export default messagesRoutes;
