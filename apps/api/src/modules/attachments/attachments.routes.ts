import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import { z } from 'zod';

import { authenticate } from '../../middleware/authenticate.js';
import { TokenService } from '../auth/token.service.js';
import { AttachmentsService } from './attachments.service.js';
import { ForbiddenError, ValidationError } from '../../utils/errors.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const attachmentsRoutes: FastifyPluginAsync = async (fastify) => {
  const tokens = new TokenService(fastify.db, fastify.redis);
  const service = new AttachmentsService(fastify.db);
  const auth = authenticate(tokens);

  fastify.post('/attachments/upload', { preHandler: auth }, async (req, reply) => {
    const { tenantId, userId } = req.auth!;
    const file = await req.file();
    if (!file) throw new ValidationError('No file part in request');

    const dto = await service.upload({
      tenantId,
      userId,
      stream: file.file,
      originalName: file.filename || 'upload.bin',
      declaredMime: file.mimetype,
    });

    return reply.status(201).send(dto);
  });

  fastify.get('/attachments/:id', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ForbiddenError('Missing bearer token');
    }
    const claims = await tokens.verifyAccessToken(authHeader.slice(7).trim());
    const tenantId = Number(claims.tenantId);

    const { id } = IdParam.parse(req.params);
    const info = await service.getForDownload(tenantId, id);

    reply
      .header('content-type', info.mimeType)
      .header('content-length', info.sizeBytes)
      .header('cache-control', 'private, max-age=3600')
      .header('content-disposition', `inline; filename="${(info.originalName ?? 'file').replace(/"/g, '')}"`);

    return reply.send(fs.createReadStream(info.absPath));
  });
};

export default attachmentsRoutes;
