import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/require-role.js';
import { TokenService } from '../auth/token.service.js';
import { TenantOriginsRepository } from './origins.repository.js';

const BodySchema = z.object({
  origin: z.string().url().max(255),
});

const originsRoutes: FastifyPluginAsync = async (fastify) => {
  const tokens = new TokenService(fastify.db, fastify.redis);
  const repo = new TenantOriginsRepository(fastify.db);
  const auth = authenticate(tokens);

  fastify.get(
    '/tenants/origins',
    { preHandler: [auth, requireRole(['admin'])] },
    async (req) => {
      const { tenantId } = req.auth!;
      const rows = await fastify.db('tenant_origins')
        .where({ tenant_id: tenantId })
        .orderBy('origin', 'asc');
      return { items: rows };
    },
  );

  fastify.post(
    '/tenants/origins',
    { preHandler: [auth, requireRole(['admin'])] },
    async (req, reply) => {
      const { tenantId } = req.auth!;
      const { origin } = BodySchema.parse(req.body);
      await repo.add(tenantId, origin);
      // invalidate cache
      await fastify.redis.del('cors:origins:active');
      return reply.status(201).send({ ok: true, origin });
    },
  );

  fastify.delete(
    '/tenants/origins',
    { preHandler: [auth, requireRole(['admin'])] },
    async (req, reply) => {
      const { tenantId } = req.auth!;
      const { origin } = BodySchema.parse(req.query);
      await repo.remove(tenantId, origin);
      await fastify.redis.del('cors:origins:active');
      return reply.status(204).send();
    },
  );
};

export default originsRoutes;
