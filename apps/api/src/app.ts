import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import underPressure from '@fastify/under-pressure';
import multipart from '@fastify/multipart';

import { env, isProduction } from './config/env.js';
import { logger } from './config/logger.js';
import dbPlugin from './plugins/db.plugin.js';
import redisPlugin from './plugins/redis.plugin.js';
import corsPlugin from './plugins/cors.plugin.js';
import errorHandlerPlugin from './plugins/error-handler.plugin.js';
import routes from './routes/index.js';
import { initSocketIO } from './sockets/io.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(helmet, {
    contentSecurityPolicy: isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(sensible);

  await app.register(multipart, {
    limits: {
      fileSize: env.UPLOAD_MAX_BYTES,
      files: 5,
      fields: 20,
    },
    attachFieldsToBody: false,
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    allowList: [],
    keyGenerator: (req) => req.ip,
  });

  await app.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 0,
    maxRssBytes: 0,
    maxEventLoopUtilization: 0.98,
    message: 'Service under pressure',
  });

  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(corsPlugin);
  await app.register(errorHandlerPlugin);

  await app.register(routes, { prefix: '/api/v1' });

    // Accept empty bodies with application/json content-type
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      if (!body || (typeof body === 'string' && body.trim().length === 0)) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await initSocketIO(app);

  return app;
}
