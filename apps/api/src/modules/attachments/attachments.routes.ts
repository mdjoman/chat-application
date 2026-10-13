import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import { z } from 'zod';

import { authenticate } from '../../middleware/authenticate.js';
import { TokenService } from '../auth/token.service.js';
import { AttachmentsService } from './attachments.service.js';
import { verifyAttachmentSignature } from './signed-url.js';
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

  /**
   * GET /attachments/:id
   *
   * Two ways to authenticate:
   * 1. Signed URL: `?exp=<unix>&sig=<hmac>` (works in <img>, <video>, <audio>)
   * 2. Bearer token (works from API clients, curl, etc.)
   */
  fastify.get('/attachments/:id', async (req, reply) => {
    const { id } = IdParam.parse(req.params);

    // --- Strategy 1: signed URL ---
    const q = req.query as { exp?: string; sig?: string };
    if (q.exp && q.sig) {
      const exp = Number(q.exp);
      if (!Number.isFinite(exp)) throw new ForbiddenError('Invalid signature');
      const ok = verifyAttachmentSignature(id, exp, q.sig);
      if (!ok) throw new ForbiddenError('Invalid or expired signature');

      // For signed-URL access we still need the tenant — look it up from the attachment.
      const row = await fastify.db('attachments').where({ id }).first();
      if (!row) throw new ForbiddenError('Attachment not found');
      const tenantId = Number(row.tenant_id);

      const info = await service.getForDownload(tenantId, id);
      reply
        .header('content-type', info.mimeType)
        .header('content-length', info.sizeBytes)
        .header('cache-control', 'private, max-age=3600')
        .header(
          'content-disposition',
          `inline; filename="${(info.originalName ?? 'file').replace(/"/g, '')}"`,
        );
      return reply.send(fs.createReadStream(info.absPath));
    }

    // --- Strategy 2: Bearer token ---
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ForbiddenError('Missing bearer token or signature');
    }
    const claims = await tokens.verifyAccessToken(authHeader.slice(7).trim());
    const tenantId = Number(claims.tenantId);

    const info = await service.getForDownload(tenantId, id);

    reply
      .header('content-type', info.mimeType)
      .header('content-length', info.sizeBytes)
      .header('cache-control', 'private, max-age=3600')
      .header(
        'content-disposition',
        `inline; filename="${(info.originalName ?? 'file').replace(/"/g, '')}"`,
      );

    return reply.send(fs.createReadStream(info.absPath));
  });
};

export default attachmentsRoutes;