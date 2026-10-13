import type { FastifyPluginAsync } from 'fastify';

import { authenticate } from '../../middleware/authenticate.js';
import { TokenService } from '../auth/token.service.js';
import { CallsService } from './calls.service.js';
import { getIO } from '../../sockets/io.js';
import { HistoryQuerySchema, IdParamSchema, InitiateCallSchema } from './calls.schemas.js';

const callsRoutes: FastifyPluginAsync = async (fastify) => {
  const tokens = new TokenService(fastify.db, fastify.redis);
  const service = new CallsService(fastify.db, fastify.redis);
  const auth = authenticate(tokens);

  fastify.post('/calls', { preHandler: auth }, async (req, reply) => {
    const { userId, tenantId } = req.auth!;
    const body = InitiateCallSchema.parse(req.body);
    const dto = await service.initiate({
      tenantId,
      conversationId: body.conversationId,
      callerId: userId,
      callType: body.callType,
      deviceId: body.deviceId,
    });

    try {
      const io = getIO();
      // Ring the caller's other devices.
      io.to(`t:${tenantId}:u:${userId}`).emit('call:ringing', dto);
      // Ring every callee.
      for (const p of dto.participants) {
        if (p.role === 'callee') {
          io.to(`t:${tenantId}:u:${p.userId}`).emit('call:incoming', {
            call: dto,
            from: userId,
          });
        }
      }
    } catch {
      /* io not initialized */
    }

    return reply.status(201).send(dto);
  });

  fastify.get('/calls/history', { preHandler: auth }, async (req) => {
    const { userId, tenantId } = req.auth!;
    const { limit, cursor } = HistoryQuerySchema.parse(req.query);
    return service.history(tenantId, userId, limit, cursor);
  });

  fastify.get('/calls/:id', { preHandler: auth }, async (req) => {
    const { tenantId } = req.auth!;
    const { id } = IdParamSchema.parse(req.params);
    return service.getById(tenantId, id);
  });
};

export default callsRoutes;