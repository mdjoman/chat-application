import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import underPressure from '@fastify/under-pressure';

import { env, corsOrigins, isProduction } from './config/env.js';
import { logger } from './config/logger.js';
import dbPlugin from './plugins/db.plugin.js';
import redisPlugin from './plugins/redis.plugin.js';
import errorHandlerPlugin from './plugins/error-handler.plugin.js';
import routes from './routes/index.js';
import { initSocketIO } from './sockets/io.js';
import multipart from '@fastify/multipart';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(helmet, {
    contentSecurityPolicy: isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (corsOrigins.length === 0) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  });
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_BYTES,
      files: 5,
    },
  });

  await app.register(sensible);

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
  await app.register(errorHandlerPlugin);

  await app.register(routes, { prefix: '/api/v1' });
  await app.register(routes);

  // Init Socket.IO AFTER routes (needs app.server)
  await initSocketIO(app);

  return app;
}
