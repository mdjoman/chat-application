import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { TokenService } from '../auth/token.service.js';
import { ConversationsService } from './conversations.service.js';
import { getIO } from '../../sockets/io.js';
import {
  AddMembersSchema,
  CreateConversationSchema,
  IdParamSchema,
  ListQuerySchema,
  MemberIdParamSchema,
  PromoteSchema,
  UpdateConversationSchema,
} from './conversations.schemas.js';

const conversationsRoutes: FastifyPluginAsync = async (fastify) => {
  const tokens = new TokenService(fastify.db, fastify.redis);
  const service = new ConversationsService(fastify.db);
  const auth = authenticate(tokens);

  function emitConversationToMembers(
    tenantId: number,
    memberIds: number[],
    conv: unknown,
  ): void {
    try {
      const io = getIO();
      for (const uid of memberIds) {
        io.to(`t:${tenantId}:u:${uid}`).emit('conversation:created', conv);
      }
    } catch { /* io not initialized */ }
  }

  fastify.get('/conversations', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const { limit, cursor } = ListQuerySchema.parse(req.query);
    return service.listForUser(tenantId, userId, limit, cursor);
  });

  fastify.post('/conversations', { preHandler: auth }, async (req, reply) => {
    const { userId, tenantId } = req.auth!;
    const body = CreateConversationSchema.parse(req.body);

    let conv;
    if (body.type === 'direct') {
      conv = await service.createDirect(tenantId, userId, body.peerId);
    } else {
      conv = await service.createGroup(tenantId, userId, {
        name: body.name,
        memberIds: body.memberIds,
        avatarUrl: body.avatarUrl ?? null,
      });
    }

    emitConversationToMembers(tenantId, conv.members.map((m) => m.userId), conv);
    return reply.status(201).send(conv);
  });

  fastify.get('/conversations/:id', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);
    return service.getById(tenantId, userId, id);
  });

  fastify.patch('/conversations/:id', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);
    const patch = UpdateConversationSchema.parse(req.body);
    const conv = await service.update(tenantId, userId, id, patch);
    emitConversationToMembers(tenantId, conv.members.map((m) => m.userId), conv);
    return conv;
  });

  fastify.post('/conversations/:id/members', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);
    const { memberIds } = AddMembersSchema.parse(req.body);
    const conv = await service.addMembers(tenantId, userId, id, memberIds);
    emitConversationToMembers(tenantId, conv.members.map((m) => m.userId), conv);
    return conv;
  });

  fastify.delete('/conversations/:id/members/:userId', { preHandler: auth }, async (req, reply) => {
    const { userId, tenantId } = req.auth!;
    const params = MemberIdParamSchema.parse(req.params);
    await service.removeMember(tenantId, userId, params.id, params.userId);
    try {
      const io = getIO();
      io.to(`t:${tenantId}:u:${params.userId}`).emit('conversation:removed', {
        conversationId: params.id,
      });
    } catch { /* noop */ }
    return reply.status(204).send();
  });

  fastify.post('/conversations/:id/leave', { preHandler: auth }, async (req, reply) => {
    const { userId, tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);
    await service.leave(tenantId, userId, id);
    try {
      const io = getIO();
      io.to(`t:${tenantId}:u:${userId}`).emit('conversation:removed', { conversationId: id });
    } catch { /* noop */ }
    return reply.status(204).send();
  });

  fastify.post(
    '/conversations/:id/members/:userId/role',
    { preHandler: auth },
    async (req, reply) => {
      const { userId, tenantId } = req.auth!;
      const params = MemberIdParamSchema.parse(req.params);
      const { role } = PromoteSchema.parse(req.body);
      await service.promote(tenantId, userId, params.id, params.userId, role);
      try {
        const conv = await service.getById(tenantId, userId, params.id);
        emitConversationToMembers(tenantId, conv.members.map((m) => m.userId), conv);
      } catch { /* noop */ }
      return reply.status(204).send();
    },
  );
};

export default conversationsRoutes;
