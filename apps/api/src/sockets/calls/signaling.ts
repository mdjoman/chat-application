import type { FastifyInstance } from 'fastify';
import type { Socket } from 'socket.io';
import { z } from 'zod';

import type { SocketContext } from '../context.js';
import { getIO, userRoom } from '../io.js';
import { CallsService } from '../../modules/calls/calls.service.js';

// ---- Payload schemas ----
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

export async function registerCallHandlers(
  app: FastifyInstance,
  socket: Socket,
  ctx: SocketContext,
): Promise<void> {
  const service = new CallsService(app.db, app.redis);

  // -------- Accept --------
  socket.on('call:accept', async (payload, ack) => {
    try {
      const { callId } = CallIdSchema.parse(payload);
      const dto = await service.accept({
        tenantId: ctx.tenantId,
        callId,
        userId: ctx.userId,
        deviceId: ctx.deviceId,
      });

      const io = getIO();
      for (const p of dto.participants) {
        io.to(userRoom(ctx.tenantId, p.userId)).emit('call:accepted', {
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

  // -------- Reject --------
  socket.on('call:reject', async (payload, ack) => {
    try {
      const parsed = z.object({
        callId: z.coerce.number().int().positive(),
        reason: z.enum(['rejected', 'busy']).optional(),
      }).parse(payload);

      const call = await service.getById(ctx.tenantId, parsed.callId);
      await service.reject({
        tenantId: ctx.tenantId,
        callId: parsed.callId,
        userId: ctx.userId,
        reason: parsed.reason,
      });

      const io = getIO();
      for (const p of call.participants) {
        io.to(userRoom(ctx.tenantId, p.userId)).emit('call:rejected', {
          callId: parsed.callId,
          userId: ctx.userId,
          reason: parsed.reason ?? 'rejected',
        });
      }
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'REJECT_FAILED', message });
    }
  });

  // -------- Cancel --------
  socket.on('call:cancel', async (payload, ack) => {
    try {
      const { callId } = CallIdSchema.parse(payload);
      const call = await service.getById(ctx.tenantId, callId);
      await service.cancel({ tenantId: ctx.tenantId, callId, userId: ctx.userId });

      const io = getIO();
      for (const p of call.participants) {
        io.to(userRoom(ctx.tenantId, p.userId)).emit('call:cancelled', {
          callId,
          byUserId: ctx.userId,
        });
      }
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'CANCEL_FAILED', message });
    }
  });

  // -------- End --------
  socket.on('call:end', async (payload, ack) => {
    try {
      const parsed = z.object({
        callId: z.coerce.number().int().positive(),
        reason: z.enum(['completed', 'remote_ended', 'network_error']).optional(),
      }).parse(payload);

      const call = await service.getById(ctx.tenantId, parsed.callId);
      await service.end({
        tenantId: ctx.tenantId,
        callId: parsed.callId,
        userId: ctx.userId,
        reason: parsed.reason ?? 'completed',
      });

      const io = getIO();
      for (const p of call.participants) {
        io.to(userRoom(ctx.tenantId, p.userId)).emit('call:ended', {
          callId: parsed.callId,
          byUserId: ctx.userId,
          reason: parsed.reason ?? 'completed',
        });
      }
      ack?.({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ack?.({ error: 'END_FAILED', message });
    }
  });

  // -------- Offer --------
  socket.on('call:offer', async (payload, ack) => {
    try {
      const parsed = OfferSchema.parse(payload);
      const call = await service.getById(ctx.tenantId, parsed.callId);
      const ids = new Set(call.participants.map((p) => p.userId));
      if (!ids.has(ctx.userId) || !ids.has(parsed.toUserId)) {
        throw new Error('Not a participant');
      }
      getIO().to(userRoom(ctx.tenantId, parsed.toUserId)).emit('call:offer', {
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

  // -------- Answer --------
  socket.on('call:answer', async (payload, ack) => {
    try {
      const parsed = AnswerSchema.parse(payload);
      getIO().to(userRoom(ctx.tenantId, parsed.toUserId)).emit('call:answer', {
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

  // -------- ICE candidate --------
  socket.on('call:ice', async (payload, ack) => {
    try {
      const parsed = IceSchema.parse(payload);
      getIO().to(userRoom(ctx.tenantId, parsed.toUserId)).emit('call:ice', {
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

  // -------- Media state --------
  socket.on('call:media-state', async (payload, ack) => {
    try {
      const parsed = MediaStateSchema.parse(payload);
      const call = await service.getById(ctx.tenantId, parsed.callId);

      const patch: Record<string, 0 | 1> = {};
      if (typeof parsed.micMuted === 'boolean') patch.mic_muted = parsed.micMuted ? 1 : 0;
      if (typeof parsed.cameraEnabled === 'boolean') patch.camera_enabled = parsed.cameraEnabled ? 1 : 0;
      if (typeof parsed.screenSharing === 'boolean') patch.screen_sharing = parsed.screenSharing ? 1 : 0;

      if (Object.keys(patch).length > 0) {
        await app.db('call_participants')
          .where({ call_id: parsed.callId, user_id: ctx.userId })
          .update({ ...patch, updated_at: app.db.fn.now() });
      }

      const io = getIO();
      for (const p of call.participants) {
        if (p.userId === ctx.userId) continue;
        io.to(userRoom(ctx.tenantId, p.userId)).emit('call:media-state', {
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

  // -------- Heartbeat --------
  socket.on('call:heartbeat', async (payload, ack) => {
    try {
      const { callId } = CallIdSchema.parse(payload);
      await app.redis.set(`call:${callId}:heartbeat:${ctx.userId}`, '1', 'EX', 30);
      ack?.({ ok: true });
    } catch {
      ack?.({ error: 'HEARTBEAT_FAILED' });
    }
  });
}

export default registerCallHandlers;