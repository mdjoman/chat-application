import type { FastifyInstance } from 'fastify';
import type { Socket } from 'socket.io';
import { z } from 'zod';

import type { SocketContext } from '../context.js';
import { getIO, tenantRoom, userRoom } from '../io.js';

const PRESENCE_TTL = 86_400;      // 24 hours
const LAST_SEEN_TTL = 2_592_000;  // 30 days

const PresenceGetSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

function presenceKey(tenantId: number, userId: number): string {
  return `presence:${tenantId}:${userId}`;
}

function lastSeenKey(tenantId: number, userId: number): string {
  return `presence:last_seen:${tenantId}:${userId}`;
}

async function countActiveSockets(
  tenantId: number,
  userId: number,
): Promise<number> {
  try {
    const sockets = await getIO().in(userRoom(tenantId, userId)).fetchSockets();
    return sockets.length;
  } catch {
    return 0;
  }
}

async function userExistsInTenant(
  app: FastifyInstance,
  tenantId: number,
  userId: number,
): Promise<boolean> {
  const row = await app.db('users')
    .where({ tenant_id: tenantId, id: userId })
    .first<{ id: number }>();
  return Boolean(row);
}

interface PresencePayload {
  userId: number;
  online: boolean;
  lastSeen: string | null;
}

async function readPresence(
  app: FastifyInstance,
  tenantId: number,
  userId: number,
): Promise<PresencePayload> {
  const active = await countActiveSockets(tenantId, userId);
  if (active > 0) {
    return { userId, online: true, lastSeen: null };
  }

  const cached = await app.redis.get(presenceKey(tenantId, userId));
  if (cached === 'online') {
    return { userId, online: true, lastSeen: null };
  }

  let lastSeen = await app.redis.get(lastSeenKey(tenantId, userId));
  if (!lastSeen) {
    try {
      const row = await app.db('users')
        .where({ tenant_id: tenantId, id: userId })
        .first<{ last_seen_at?: Date | string | null }>();
      if (row?.last_seen_at) {
        lastSeen = new Date(row.last_seen_at).toISOString();
      }
    } catch {
      /* users.last_seen_at may not exist — ignore */
    }
  }

  return { userId, online: false, lastSeen: lastSeen ?? null };
}

export async function registerPresenceHandlers(
  app: FastifyInstance,
  socket: Socket,
  ctx: SocketContext,
): Promise<void> {
  const me = { tenantId: ctx.tenantId, userId: ctx.userId };

  // ---- on connect ----
  const activeCount = await countActiveSockets(me.tenantId, me.userId);

  try {
    await app.redis.set(presenceKey(me.tenantId, me.userId), 'online', 'EX', PRESENCE_TTL);
  } catch (err) {
    app.log.warn({ err }, 'presence: set online failed');
  }

  if (activeCount <= 1) {
    // Emit BOTH legacy and new event names so any client works.
    getIO().to(tenantRoom(me.tenantId)).emit('presence:online', {
      userId: me.userId,
      online: true,
      lastSeen: null,
    });
    getIO().to(tenantRoom(me.tenantId)).emit('presence:update', {
      userId: me.userId,
      status: 'online',
      lastSeenAt: new Date().toISOString(),
    });
  }

  // ---- presence:get ----
  socket.on('presence:get', async (payload: unknown, ack?: (r: unknown) => void) => {
    try {
      const { userId } = PresenceGetSchema.parse(payload);
      const exists = await userExistsInTenant(app, me.tenantId, userId);
      if (!exists) {
        ack?.({ ok: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
        return;
      }
      const presence = await readPresence(app, me.tenantId, userId);
      ack?.({ ok: true, data: presence });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid presence request';
      ack?.({ ok: false, error: { code: 'PRESENCE_ERROR', message } });
    }
  });

  // ---- presence:heartbeat ----
  socket.on('presence:heartbeat', async () => {
    try {
      await app.redis.set(presenceKey(me.tenantId, me.userId), 'online', 'EX', PRESENCE_TTL);
    } catch {
      /* ignore */
    }
  });

  // ---- on disconnect ----
  socket.on('disconnect', async () => {
    await new Promise<void>((r) => setTimeout(r, 50));

    const remaining = await countActiveSockets(me.tenantId, me.userId);
    if (remaining > 0) {
      try {
        await app.redis.set(presenceKey(me.tenantId, me.userId), 'online', 'EX', PRESENCE_TTL);
      } catch { /* ignore */ }
      return;
    }

    const lastSeen = new Date().toISOString();
    try {
      await app.redis.del(presenceKey(me.tenantId, me.userId));
      await app.redis.set(lastSeenKey(me.tenantId, me.userId), lastSeen, 'EX', LAST_SEEN_TTL);
      // Persist to users.last_seen_at too
      await app.db('users')
        .where({ tenant_id: me.tenantId, id: me.userId })
        .update({ last_seen_at: app.db.fn.now() });
    } catch { /* ignore */ }

    getIO().to(tenantRoom(me.tenantId)).emit('presence:offline', {
      userId: me.userId,
      online: false,
      lastSeen,
    });
    getIO().to(tenantRoom(me.tenantId)).emit('presence:update', {
      userId: me.userId,
      status: 'offline',
      lastSeenAt: lastSeen,
    });
  });
}

export default registerPresenceHandlers;