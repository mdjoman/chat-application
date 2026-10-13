
import Fastify, { type FastifyInstance } from 'fastify';

import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import underPressure from '@fastify/under-pressure';
import multipart from '@fastify/multipart';
import crypto from 'node:crypto';

import { env, isProduction } from './config/env.js';

import dbPlugin from './plugins/db.plugin.js';
import redisPlugin from './plugins/redis.plugin.js';
import corsPlugin from './plugins/cors.plugin.js';
import errorHandlerPlugin from './plugins/error-handler.plugin.js';

import routes from './routes/index.js';
import { initSocketIO } from './sockets/io.js';

export async function buildApp(): Promise<FastifyInstance> {
  // --------------------------------------------------
  // 1. Initialize Fastify
  // --------------------------------------------------

  const app: FastifyInstance = Fastify({
    logger: true,
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // --------------------------------------------------
  // 2. JSON Content-Type Parser
  // --------------------------------------------------
  // Allows empty JSON request bodies.
  // Required for routes such as:
  // POST /conversations/:id/leave

  app.removeContentTypeParser('application/json');

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      if (
        !body ||
        (typeof body === 'string' && body.trim().length === 0)
      ) {
        done(null, {});
        return;
      }

      try {
        const parsed = JSON.parse(body as string);
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // --------------------------------------------------
  // 3. Security Headers
  // --------------------------------------------------

  await app.register(helmet, {
    contentSecurityPolicy: isProduction
      ? undefined
      : false,

    crossOriginEmbedderPolicy: false,

    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  });

  // --------------------------------------------------
  // 4. Sensible Plugin
  // --------------------------------------------------

  await app.register(sensible);

  // --------------------------------------------------
  // 5. Multipart Upload
  // --------------------------------------------------

  await app.register(multipart, {
    limits: {
      fileSize: env.UPLOAD_MAX_BYTES,
      files: 5,
      fields: 20,
    },

    attachFieldsToBody: false,
  });

  // --------------------------------------------------
  // 6. Rate Limiting
  // --------------------------------------------------

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    allowList: [],

    keyGenerator: (req) => req.ip,
  });

  // --------------------------------------------------
  // 7. Server Pressure Protection
  // --------------------------------------------------

  await app.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 0,
    maxRssBytes: 0,
    maxEventLoopUtilization: 0.98,

    message: 'Service under pressure',
  });

  // --------------------------------------------------
  // 8. Database Plugin
  // --------------------------------------------------

  await app.register(dbPlugin);

  // --------------------------------------------------
  // 9. Redis Plugin
  // --------------------------------------------------

  await app.register(redisPlugin);

  // --------------------------------------------------
  // 10. CORS Plugin
  // --------------------------------------------------

  await app.register(corsPlugin);

  // --------------------------------------------------
  // 11. Error Handler
  // --------------------------------------------------

  await app.register(errorHandlerPlugin);

  // --------------------------------------------------
  // 12. API Routes
  // --------------------------------------------------

  await app.register(routes, {
    prefix: '/api/v1',
  });

  // --------------------------------------------------
  // 13. Socket.IO
  // --------------------------------------------------

  await initSocketIO(app);

  // --------------------------------------------------
  // 14. Return Fastify Instance
  // --------------------------------------------------

  return app;
}
