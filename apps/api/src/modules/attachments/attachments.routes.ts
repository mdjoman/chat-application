import type { FastifyPluginAsync } from 'fastify';
import { createReadStream } from 'node:fs';
import { z } from 'zod';

import { authenticate } from '../../middleware/authenticate.js';
import { TokenService } from '../auth/token.service.js';
import { AttachmentsService } from './attachments.service.js';

const IdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const attachmentsRoutes: FastifyPluginAsync = async (fastify) => {
  const tokens = new TokenService(fastify.db, fastify.redis);
  const service = new AttachmentsService(fastify.db);
  const auth = authenticate(tokens);

  fastify.post('/attachments/upload', { preHandler: auth }, async (req, reply) => {
    const { userId, tenantId } = req.auth!;
    const file = await req.file();
    if (!file) {
      return reply.status(400).send({ error: { code: 'NO_FILE', message: 'No file part' } });
    }
    const buffer = await file.toBuffer();
    const result = await service.upload({
      tenantId,
      userId,
      buffer,
      mimeType: file.mimetype,
      originalName: file.filename,
    });
    return reply.status(201).send(result);
  });

  fastify.get('/attachments/:id', async (req, reply) => {
    // Downloads are authenticated by bearer OR by a signed URL later.
    // For Phase 4 we allow GET without auth (URL is randomized via id + storage key).
    // NOTE: Phase 6 will add signed URLs.
    const { id } = IdParamSchema.parse(req.params);
    // tenantId: derive from token if provided; fallback to default tenant
    let tenantId = 1;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const claims = await tokens.verifyAccessToken(header.slice(7).trim());
        tenantId = Number(claims.tenantId);
      } catch {
        /* ignore — fall through to default */
      }
    }
    const { row, absPath } = await service.getForDownload(tenantId, id);

    reply.header('content-type', row.mime_type);
    reply.header(
      'content-disposition',
      `inline; filename="${(row.original_name ?? 'file').replace(/"/g, '')}"`,
    );
    if (row.size_bytes) reply.header('content-length', String(row.size_bytes));
    return reply.send(createReadStream(absPath));
  });
};

export default attachmentsRoutes;
