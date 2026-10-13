import { Server as SocketIOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

import { env, corsOrigins } from '../config/env.js';
import { TokenService } from '../modules/auth/token.service.js';
import { TenantOriginsRepository } from '../modules/tenants/origins.repository.js';
import type { SocketContext } from './context.js';
import { registerHandlers } from './register.js';

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

export function tenantRoom(tenantId: number): string {
  return `t:${tenantId}`;
}
export function userRoom(tenantId: number, userId: number): string {
  return `t:${tenantId}:u:${userId}`;
}
export function conversationRoom(tenantId: number, conversationId: number): string {
  return `t:${tenantId}:c:${conversationId}`;
}

export async function initSocketIO(app: FastifyInstance): Promise<SocketIOServer> {
  const originsRepo = new TenantOriginsRepository(app.db);

  async function isOriginAllowed(origin: string | undefined): Promise<boolean> {
    if (!origin) return true; // non-browser clients (curl, mobile SDK)
    if (corsOrigins.includes(origin)) return true;
    try {
      return await originsRepo.isAllowed(origin);
    } catch {
      return false;
    }
  }

  const server = new SocketIOServer(app.server, {
    path: '/socket.io',
    cors: {
      origin: async (origin, cb) => {
        const ok = await isOriginAllowed(origin);
        if (!ok) app.log.warn({ origin }, 'socket.io CORS: origin not allowed');
        cb(null, ok);
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 1_000_000,
  });

  const pubClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    keyPrefix: env.REDIS_KEY_PREFIX,
  });
  const subClient = pubClient.duplicate();
  server.adapter(createAdapter(pubClient, subClient));

  const tokens = new TokenService(app.db, app.redis);

  // ---- Auth handshake ----
  server.use(async (socket, next) => {
    try {
      const auth = (socket.handshake.auth || {}) as { token?: string; deviceId?: string };
      const headerAuth = socket.handshake.headers.authorization;
      const bearer =
        auth.token ||
        (typeof headerAuth === 'string' && headerAuth.startsWith('Bearer ')
          ? headerAuth.slice(7).trim()
          : undefined);

      if (!bearer) return next(new Error('UNAUTHORIZED'));

      const claims = await tokens.verifyAccessToken(bearer);
      const ctx: SocketContext = {
        userId: Number(claims.sub),
        tenantId: Number(claims.tenantId),
        role: String(claims.role),
        deviceId: auth.deviceId ?? 'web',
      };
      socket.data.ctx = ctx;
      next();
    } catch (err) {
      app.log.warn({ err }, 'socket auth failed');
      next(new Error('UNAUTHORIZED'));
    }
  });

  // ---- On connection ----
  server.on('connection', (socket: Socket) => {
    const ctx = socket.data.ctx as SocketContext;

    socket.join(tenantRoom(ctx.tenantId));
    socket.join(userRoom(ctx.tenantId, ctx.userId));

    app.log.info(
      { socketId: socket.id, userId: ctx.userId, tenantId: ctx.tenantId },
      'socket connected',
    );

    void registerHandlers(app, socket);

    socket.on('disconnect', (reason) => {
      app.log.info({ socketId: socket.id, reason }, 'socket disconnected');
    });
  });

  app.addHook('onClose', async () => {
    await server.close();
    await pubClient.quit();
    await subClient.quit();
    app.log.info('socket.io closed');
  });

  io = server;
  return server;
}