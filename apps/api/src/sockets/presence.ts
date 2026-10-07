import type {
  FastifyInstance,
} from 'fastify';

import type {
  Socket,
} from 'socket.io';

import {
  z,
} from 'zod';

import {
  getIO,
  tenantRoom,
  userRoom,
} from './io.js';

import type {
  SocketContext,
} from './context.js';

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const PRESENCE_TTL_SECONDS =
  60 * 60 * 24;

const LAST_SEEN_TTL_SECONDS =
  60 * 60 * 24 * 30;

/**
 * ============================================================
 * SCHEMAS
 * ============================================================
 */

const PresenceGetSchema =
  z.object({
    userId:
      z.coerce
        .number()
        .int()
        .positive(),
  });

/**
 * ============================================================
 * REDIS KEY HELPERS
 * ============================================================
 *
 * Every key contains tenantId.
 *
 * This is important because:
 *
 * Tenant A user 5
 *
 * and
 *
 * Tenant B user 5
 *
 * are different users.
 */

function presenceKey(
  tenantId: number,
  userId: number,
): string {
  return `presence:${tenantId}:${userId}`;
}

function lastSeenKey(
  tenantId: number,
  userId: number,
): string {
  return `presence:last_seen:${tenantId}:${userId}`;
}

/**
 * ============================================================
 * DATE HELPER
 * ============================================================
 */

function nowIso(): string {
  return new Date()
    .toISOString();
}

/**
 * ============================================================
 * REDIS SAFE SET
 * ============================================================
 */

async function setRedisValue(
  app: FastifyInstance,
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    /**
     * ioredis style:
     *
     * SET key value EX seconds
     */

    await app.redis.set(
      key,
      value,
      'EX',
      ttlSeconds,
    );
  } catch (error) {
    app.log.warn(
      {
        err: error,
        key,
      },
      'Failed to update presence Redis key',
    );
  }
}

/**
 * ============================================================
 * REDIS SAFE GET
 * ============================================================
 */

async function getRedisValue(
  app: FastifyInstance,
  key: string,
): Promise<string | null> {
  try {
    return await app.redis.get(
      key,
    );
  } catch (error) {
    app.log.warn(
      {
        err: error,
        key,
      },
      'Failed to read presence Redis key',
    );

    return null;
  }
}

/**
 * ============================================================
 * REDIS SAFE DELETE
 * ============================================================
 */

async function deleteRedisValue(
  app: FastifyInstance,
  key: string,
): Promise<void> {
  try {
    await app.redis.del(
      key,
    );
  } catch (error) {
    app.log.warn(
      {
        err: error,
        key,
      },
      'Failed to delete presence Redis key',
    );
  }
}

/**
 * ============================================================
 * USER ONLINE CHECK
 * ============================================================
 *
 * Personal room:
 *
 * t:{tenantId}:u:{userId}
 *
 * All browser tabs/devices belonging to the same user join
 * this room.
 */

async function getActiveSocketCount(
  tenantId: number,
  userId: number,
): Promise<number> {
  const sockets =
    await getIO()
      .in(
        userRoom(
          tenantId,
          userId,
        ),
      )
      .fetchSockets();

  return sockets.length;
}

/**
 * ============================================================
 * TENANT USER CHECK
 * ============================================================
 *
 * presence:get must not allow:
 *
 * Tenant A
 *     ↓
 * query Tenant B user
 */

async function userExistsInTenant(
  app: FastifyInstance,
  tenantId: number,
  userId: number,
): Promise<boolean> {
  const row =
    await app.db(
      'users',
    )
      .where({
        tenant_id:
          tenantId,

        id:
          userId,
      })
      .first<{
        id: number;
      }>();

  return Boolean(
    row,
  );
}

/**
 * ============================================================
 * PRESENCE DTO
 * ============================================================
 */

interface PresencePayload {
  userId: number;

  online: boolean;

  lastSeen: string | null;
}

/**
 * ============================================================
 * CURRENT PRESENCE
 * ============================================================
 */

async function getPresence(
  app: FastifyInstance,
  tenantId: number,
  userId: number,
): Promise<PresencePayload> {
  /**
   * Socket room is the primary source of truth for current
   * process-level presence.
   */

  let activeSockets =
    0;

  try {
    activeSockets =
      await getActiveSocketCount(
        tenantId,
        userId,
      );
  } catch (error) {
    app.log.warn(
      {
        err: error,
        tenantId,
        userId,
      },
      'Failed to inspect active sockets',
    );
  }

  if (
    activeSockets > 0
  ) {
    return {
      userId,

      online:
        true,

      lastSeen:
        null,
    };
  }

  /**
   * Redis fallback.
   */

  const redisPresence =
    await getRedisValue(
      app,
      presenceKey(
        tenantId,
        userId,
      ),
    );

  if (
    redisPresence ===
    'online'
  ) {
    return {
      userId,

      online:
        true,

      lastSeen:
        null,
    };
  }

  /**
   * Last seen from Redis.
   */

  let lastSeen =
    await getRedisValue(
      app,
      lastSeenKey(
        tenantId,
        userId,
      ),
    );

  /**
   * Optional database fallback.
   *
   * We intentionally query last_seen only defensively.
   * If the current users schema does not contain this field,
   * Redis remains enough for presence operation.
   */

  if (!lastSeen) {
    try {
      const row =
        await app.db(
          'users',
        )
          .where({
            tenant_id:
              tenantId,

            id:
              userId,
          })
          .first<{
            last_seen?:
              Date | string | null;
          }>();

      if (
        row?.last_seen
      ) {
        lastSeen =
          new Date(
            row.last_seen,
          ).toISOString();
      }
    } catch {
      /**
       * Do not break presence because last_seen may not exist
       * in the current users schema.
       */
    }
  }

  return {
    userId,

    online:
      false,

    lastSeen:
      lastSeen ??
      null,
  };
}

/**
 * ============================================================
 * BROADCAST ONLINE
 * ============================================================
 *
 * IMPORTANT:
 *
 * Never:
 *
 * getIO().emit(...)
 *
 * Presence is tenant scoped.
 */

function broadcastOnline(
  tenantId: number,
  userId: number,
): void {
  getIO()
    .to(
      tenantRoom(
        tenantId,
      ),
    )
    .emit(
      'presence:online',
      {
        userId,

        online:
          true,

        lastSeen:
          null,
      },
    );
}

/**
 * ============================================================
 * BROADCAST OFFLINE
 * ============================================================
 */

function broadcastOffline(
  tenantId: number,
  userId: number,
  lastSeen: string,
): void {
  getIO()
    .to(
      tenantRoom(
        tenantId,
      ),
    )
    .emit(
      'presence:offline',
      {
        userId,

        online:
          false,

        lastSeen,
      },
    );
}

/**
 * ============================================================
 * REGISTER PRESENCE HANDLERS
 * ============================================================
 */

export async function registerPresenceHandlers(
  app: FastifyInstance,
  socket: Socket,
  ctx: SocketContext,
): Promise<void> {
  /**
   * ==========================================================
   * USER CONNECTED
   * ==========================================================
   *
   * FILE 40 joins personal room before this handler is
   * registered.
   */

  let activeSockets =
    1;

  try {
    activeSockets =
      await getActiveSocketCount(
        ctx.tenantId,
        ctx.userId,
      );
  } catch (error) {
    app.log.warn(
      {
        err: error,
        userId:
          ctx.userId,
        tenantId:
          ctx.tenantId,
      },
      'Failed to count presence sockets',
    );
  }

  /**
   * Keep Redis current.
   */

  await setRedisValue(
    app,
    presenceKey(
      ctx.tenantId,
      ctx.userId,
    ),
    'online',
    PRESENCE_TTL_SECONDS,
  );

  /**
   * Broadcast only when this is effectively the first active
   * socket.
   *
   * This avoids:
   *
   * browser tab 1 → online
   * browser tab 2 → online again
   * browser tab 3 → online again
   */

  if (
    activeSockets <= 1
  ) {
    broadcastOnline(
      ctx.tenantId,
      ctx.userId,
    );
  }

  /**
   * ==========================================================
   * PRESENCE GET
   * ==========================================================
   *
   * Frontend:
   *
   * socket.emit(
   *   'presence:get',
   *   { userId: 10 },
   *   callback
   * )
   */

  socket.on(
    'presence:get',
    async (
      payload: unknown,
      ack?: (
        response: unknown,
      ) => void,
    ) => {
      try {
        const data =
          PresenceGetSchema.parse(
            payload,
          );

        const exists =
          await userExistsInTenant(
            app,
            ctx.tenantId,
            data.userId,
          );

        if (!exists) {
          if (
            typeof ack ===
            'function'
          ) {
            ack({
              ok: false,

              error: {
                code:
                  'USER_NOT_FOUND',

                message:
                  'User not found',
              },
            });
          }

          return;
        }

        const presence =
          await getPresence(
            app,
            ctx.tenantId,
            data.userId,
          );

        if (
          typeof ack ===
          'function'
        ) {
          ack({
            ok: true,

            data:
              presence,
          });
        }
      } catch (error) {
        const message =
          error instanceof
          Error
            ? error.message
            : 'Invalid presence request';

        if (
          typeof ack ===
          'function'
        ) {
          ack({
            ok: false,

            error: {
              code:
                'PRESENCE_ERROR',

              message,
            },
          });
        }
      }
    },
  );

  /**
   * ==========================================================
   * PRESENCE REFRESH
   * ==========================================================
   *
   * Optional frontend heartbeat.
   *
   * Socket.IO already has its own ping/pong, so this event is
   * not mandatory.
   *
   * It only refreshes the Redis presence TTL.
   */

  socket.on(
    'presence:heartbeat',
    async () => {
      await setRedisValue(
        app,
        presenceKey(
          ctx.tenantId,
          ctx.userId,
        ),
        'online',
        PRESENCE_TTL_SECONDS,
      );
    },
  );

  /**
   * ==========================================================
   * DISCONNECT
   * ==========================================================
   *
   * Critical multi-device logic:
   *
   * Device A disconnects
   *       ↓
   * Device B still connected
   *       ↓
   * user remains ONLINE
   *
   * Only when zero sockets remain:
   *
   * user → OFFLINE
   */

  socket.on(
    'disconnect',
    async (
      reason,
    ) => {
      /**
       * Socket.IO removes the disconnected socket from rooms
       * during disconnect lifecycle.
       *
       * Use a short next-tick delay so fetchSockets() observes
       * the updated room membership.
       */

      await new Promise<void>(
        (resolve) => {
          setTimeout(
            resolve,
            0,
          );
        },
      );

      let remainingSockets =
        0;

      try {
        remainingSockets =
          await getActiveSocketCount(
            ctx.tenantId,
            ctx.userId,
          );
      } catch (error) {
        app.log.warn(
          {
            err: error,
            userId:
              ctx.userId,
            tenantId:
              ctx.tenantId,
          },
          'Failed to count sockets after disconnect',
        );

        /**
         * Avoid incorrectly broadcasting offline if socket
         * state could not be determined.
         */

        return;
      }

      if (
        remainingSockets >
        0
      ) {
        /**
         * Another tab/device is still connected.
         */

        await setRedisValue(
          app,
          presenceKey(
            ctx.tenantId,
            ctx.userId,
          ),
          'online',
          PRESENCE_TTL_SECONDS,
        );

        return;
      }

      const lastSeen =
        nowIso();

      await deleteRedisValue(
        app,
        presenceKey(
          ctx.tenantId,
          ctx.userId,
        ),
      );

      await setRedisValue(
        app,
        lastSeenKey(
          ctx.tenantId,
          ctx.userId,
        ),
        lastSeen,
        LAST_SEEN_TTL_SECONDS,
      );

      broadcastOffline(
        ctx.tenantId,
        ctx.userId,
        lastSeen,
      );

      app.log.debug(
        {
          userId:
            ctx.userId,

          tenantId:
            ctx.tenantId,

          lastSeen,

          reason,
        },
        'User presence changed to offline',
      );
    },
  );
}

export default registerPresenceHandlers;
