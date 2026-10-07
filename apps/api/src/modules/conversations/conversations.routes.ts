import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { TokenService } from '../auth/token.service.js';
import { ConversationsService } from './conversations.service.js';
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

  fastify.get('/conversations', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const { limit, cursor } = ListQuerySchema.parse(req.query);
    return service.listForUser(tenantId, userId, limit, cursor);
  });

  fastify.post('/conversations', { preHandler: auth }, async (req, reply) => {
    const { userId, tenantId } = req.auth!;
    const body = CreateConversationSchema.parse(req.body);
    const conv =
      body.type === 'direct'
        ? await service.createDirect(tenantId, userId, body.peerId)
        : await service.createGroup(tenantId, userId, {
            name: body.name,
            memberIds: body.memberIds,
            avatarUrl: body.avatarUrl ?? null,
          });
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
    return service.update(tenantId, userId, id, patch);
  });

  fastify.post('/conversations/:id/members', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);
    const { memberIds } = AddMembersSchema.parse(req.body);
    return service.addMembers(tenantId, userId, id, memberIds);
  });

  fastify.delete('/conversations/:id/members/:userId', { preHandler: auth }, async (req, reply) => {
    const { userId, tenantId } = req.auth!;
    const params = MemberIdParamSchema.parse(req.params);
    await service.removeMember(tenantId, userId, params.id, params.userId);
    return reply.status(204).send();
  });

  fastify.post('/conversations/:id/leave', { preHandler: auth }, async (req, reply) => {
    const { userId, tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);
    await service.leave(tenantId, userId, id);
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
      return reply.status(204).send();
    },
  );
};

export default conversationsRoutes;
