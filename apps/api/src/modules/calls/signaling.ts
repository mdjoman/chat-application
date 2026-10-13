import type { FastifyInstance } from 'fastify';
import type { Socket } from 'socket.io';
import { z } from 'zod';

import type { SocketContext } from '../../sockets/context.js';
import { CallsService } from './calls.service.js';
import { getIO } from '../../sockets/io.js';
// --- Payload schemas ---------------------------------------------------------

const CallIdSchema = z.object({
  callId: z.coerce.number().int().positive(),
});

const OfferSchema = z.object({
  callId: z.coerce.number().int().positive(),
  toUserId: z.coerce.number().int().positive(),
  sdp: z.string().min(1),
});

const AnswerSchema = z.object({
  callId: z.coerce.number().int().positive(),
  toUserId: z.coerce.number().int().positive(),
  sdp: z.string().min(1),
});

const IceSchema = z.object({
  callId: z.coerce.number().int().positive(),
  toUserId: z.coerce.number().int().positive(),
  candidate: z.object({
    candidate: z.string(),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().nullable().optional(),
    usernameFragment: z.string().nullable().optional(),
  }),
});

const MediaStateSchema = z.object({
  callId: z.coerce.number().int().positive(),
  micMuted: z.boolean().optional(),
  cameraEnabled: z.boolean().optional(),
  screenSharing: z.boolean().optional(),
});

// --- Registration ------------------------------------------------------------

export async function registerCallHandlers(
  app: FastifyInstance,
  socket: Socket,
  ctx: SocketContext,
): Promise<void> {
  const service = new CallsService(app.db, app.redis);

  // ---------------------------------------------------------------------------
  // Ring the callee's user room.
  // ---------------------------------------------------------------------------
  const userRoom = (userId: number) => `t:${ctx.tenantId}:u:${userId}`;

  // ---------------------------------------------------------------------------
  // Accept / reject / cancel / end
  // ---------------------------------------------------------------------------

  socket.on('call:accept', async (payload, ack) => {
    try {
      const { callId } = CallIdSchema.parse(payload);
      const dto = await service.accept({
        tenantId: ctx.tenantId,
        callId,
        userId: ctx.userId,
        deviceId: ctx.deviceId,
      });

      // Notify caller + all callees that this participant accepted.
      const io = getIO();
      for (const p of dto.participants) {
        io.to(userRoom(p.userId)).emit('call:accepted', {
          callId,
          userId: ctx.userId,
          call: dto,
        });
      }
      ack?.({ ok: true, call: dto });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'ACCEPT_FAILED', message });
    }
  });

  socket.on('call:reject', async (payload, ack) => {
    try {
      const { callId, reason } = z
        .object({
          callId: z.coerce.number().int().positive(),
          reason: z.enum(['rejected', 'busy']).optional(),
        })
        .parse(payload);

      const call = await service.getById(ctx.tenantId, callId);
      await service.reject({
        tenantId: ctx.tenantId,
        callId,
        userId: ctx.userId,
        reason,
      });

      const io = getIO();
      for (const p of call.participants) {
        io.to(userRoom(p.userId)).emit('call:rejected', {
          callId,
          userId: ctx.userId,
          reason: reason ?? 'rejected',
        });
      }
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'REJECT_FAILED', message });
    }
  });

  socket.on('call:cancel', async (payload, ack) => {
    try {
      const { callId } = CallIdSchema.parse(payload);
      const call = await service.getById(ctx.tenantId, callId);
      await service.cancel({ tenantId: ctx.tenantId, callId, userId: ctx.userId });
      const io = getIO();
      for (const p of call.participants) {
        io.to(userRoom(p.userId)).emit('call:cancelled', { callId, byUserId: ctx.userId });
      }
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'CANCEL_FAILED', message });
    }
  });

  socket.on('call:end', async (payload, ack) => {
    try {
      const { callId, reason } = z
        .object({
          callId: z.coerce.number().int().positive(),
          reason: z.enum(['completed', 'remote_ended', 'network_error']).optional(),
        })
        .parse(payload);

      const call = await service.getById(ctx.tenantId, callId);
      await service.end({
        tenantId: ctx.tenantId,
        callId,
        userId: ctx.userId,
        reason: reason ?? 'completed',
      });

      const io = getIO();
      for (const p of call.participants) {
        io.to(userRoom(p.userId)).emit('call:ended', {
          callId,
          byUserId: ctx.userId,
          reason: reason ?? 'completed',
        });
      }
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'END_FAILED', message });
    }
  });

  // ---------------------------------------------------------------------------
  // WebRTC signaling relay
  // ---------------------------------------------------------------------------

  socket.on('call:offer', async (payload, ack) => {
    try {
      const parsed = OfferSchema.parse(payload);
      // Sanity: both users must be participants of the call.
      const call = await service.getById(ctx.tenantId, parsed.callId);
      const ids = new Set(call.participants.map((p) => p.userId));
      if (!ids.has(ctx.userId) || !ids.has(parsed.toUserId)) {
        throw new Error('Not a participant');
      }

      const io = getIO();
      io.to(userRoom(parsed.toUserId)).emit('call:offer', {
        callId: parsed.callId,
        fromUserId: ctx.userId,
        sdp: parsed.sdp,
      });
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'OFFER_FAILED', message });
    }
  });

  socket.on('call:answer', async (payload, ack) => {
    try {
      const parsed = AnswerSchema.parse(payload);
      const io = getIO();
      io.to(userRoom(parsed.toUserId)).emit('call:answer', {
        callId: parsed.callId,
        fromUserId: ctx.userId,
        sdp: parsed.sdp,
      });
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'ANSWER_FAILED', message });
    }
  });

  socket.on('call:ice', async (payload, ack) => {
    try {
      const parsed = IceSchema.parse(payload);
      const io = getIO();
      io.to(userRoom(parsed.toUserId)).emit('call:ice', {
        callId: parsed.callId,
        fromUserId: ctx.userId,
        candidate: parsed.candidate,
      });
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'ICE_FAILED', message });
    }
  });

  // ---------------------------------------------------------------------------
  // Media state broadcast
  // ---------------------------------------------------------------------------

  socket.on('call:media-state', async (payload, ack) => {
    try {
      const parsed = MediaStateSchema.parse(payload);
      const call = await service.getById(ctx.tenantId, parsed.callId);
      const io = getIO();

      // Persist to call_participants for later replay (best-effort).
      const patch: Record<string, 0 | 1> = {};
      if (typeof parsed.micMuted === 'boolean') patch.mic_muted = parsed.micMuted ? 1 : 0;
      if (typeof parsed.cameraEnabled === 'boolean') patch.camera_enabled = parsed.cameraEnabled ? 1 : 0;
      if (typeof parsed.screenSharing === 'boolean') patch.screen_sharing = parsed.screenSharing ? 1 : 0;
      if (Object.keys(patch).length > 0) {
        await app.db('call_participants')
          .where({ call_id: parsed.callId, user_id: ctx.userId })
          .update({ ...patch, updated_at: app.db.fn.now() });
      }

      for (const p of call.participants) {
        if (p.userId === ctx.userId) continue;
        io.to(userRoom(p.userId)).emit('call:media-state', {
          callId: parsed.callId,
          userId: ctx.userId,
          micMuted: parsed.micMuted,
          cameraEnabled: parsed.cameraEnabled,
          screenSharing: parsed.screenSharing,
        });
      }
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'MEDIA_STATE_FAILED', message });
    }
  });

  // ---------------------------------------------------------------------------
  // Connection quality (best-effort relay, no persistence)
  // ---------------------------------------------------------------------------

  socket.on('call:quality', async (payload, ack) => {
    try {
      const parsed = z
        .object({
          callId: z.coerce.number().int().positive(),
          toUserId: z.coerce.number().int().positive().optional(),
          stats: z.record(z.unknown()),
        })
        .parse(payload);

      const call = await service.getById(ctx.tenantId, parsed.callId);
      const io = getIO();
      for (const p of call.participants) {
        if (p.userId === ctx.userId) continue;
        if (parsed.toUserId && p.userId !== parsed.toUserId) continue;
        io.to(userRoom(p.userId)).emit('call:quality', {
          callId: parsed.callId,
          userId: ctx.userId,
          stats: parsed.stats,
        });
      }
      ack?.({ ok: true });
    } catch {
      ack?.({ error: 'QUALITY_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Heartbeat while in a call (extends Redis TTL)
  // ---------------------------------------------------------------------------

  socket.on('call:heartbeat', async (payload, ack) => {
    try {
      const { callId } = CallIdSchema.parse(payload);
      const key = `call:${callId}:heartbeat:${ctx.userId}`;
      await app.redis.set(key, '1', 'EX', 30);
      ack?.({ ok: true });
    } catch {
      ack?.({ error: 'HEARTBEAT_FAILED' });
    }
  });
}