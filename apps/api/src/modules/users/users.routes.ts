import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { TokenService } from '../auth/token.service.js';
import { UsersService } from './users.service.js';
import {
  IdParamSchema,
  SearchQuerySchema,
  UpdateMeSchema,
  UpdateSettingsSchema,
} from './users.schemas.js';

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const tokens = new TokenService(fastify.db, fastify.redis);
  const service = new UsersService(fastify.db);
  const auth = authenticate(tokens);

  fastify.get('/users/me', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    return service.getMe(tenantId, userId);
  });

  fastify.patch('/users/me', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const patch = UpdateMeSchema.parse(req.body);
    return service.updateMe(tenantId, userId, patch);
  });

  fastify.get('/users/me/settings', { preHandler: auth }, async (req) => {
    const { userId } = req.auth!;
    return service.getSettings(userId);
  });

  fastify.patch('/users/me/settings', { preHandler: auth }, async (req) => {
    const { userId } = req.auth!;
    const patch = UpdateSettingsSchema.parse(req.body);
    return service.updateSettings(userId, patch);
  });

  fastify.get('/users/search', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const { q, limit, offset } = SearchQuerySchema.parse(req.query);
    return { items: await service.search(tenantId, q, limit, offset) };
  });

  fastify.get('/users/:id', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);
    return service.getPublic(tenantId, userId, id);
  });
};

export default usersRoutes;
