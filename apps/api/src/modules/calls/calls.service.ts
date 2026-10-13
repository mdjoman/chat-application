import type { Knex } from 'knex';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

import { env } from '../../config/env.js';
import { ForbiddenError, NotFoundError, ConflictError, AppError } from '../../utils/errors.js';
import { ConversationsRepository } from '../conversations/conversations.repository.js';
import { CallsRepository, type CallRow, type CallParticipantRow } from './calls.repository.js';
import type {
  CallDTO,
  CallParticipantDTO,
  CallType,
  CallStatus,
} from '@chat/shared-types';

export class CallsService {
  private readonly repo: CallsRepository;
  private readonly convos: ConversationsRepository;

  constructor(
    private readonly db: Knex,
    private readonly redis: Redis,
  ) {
    this.repo = new CallsRepository(db);
    this.convos = new ConversationsRepository(db);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initiate(input: {
    tenantId: number;
    conversationId: number;
    callerId: number;
    callType: CallType;
    deviceId?: string;
  }): Promise<CallDTO> {
    // Caller must be a member of the conversation.
    const member = await this.convos.getMember(input.conversationId, input.callerId);
    if (!member) throw new ForbiddenError('Not a member of this conversation');

    // Prevent multiple simultaneous calls per user.
    const active = await this.repo.findActiveForUser(input.tenantId, input.callerId);
    if (active) throw new ConflictError('You are already in a call');

    // Determine the callee list.
    const memberRows = await this.convos.listMembers(input.conversationId);
    const calleeIds = memberRows.map((m) => m.user_id).filter((id) => id !== input.callerId);
    if (calleeIds.length === 0) throw new ConflictError('No recipients');

    // For 1:1 calls, verify callee is not busy.
    if (calleeIds.length === 1) {
      const calleeActive = await this.repo.findActiveForUser(input.tenantId, calleeIds[0]!);
      if (calleeActive) throw new ConflictError('User is busy');
    }

    const callUuid = randomUUID();

    const callId = await this.db.transaction(async (trx) => {
      const id = await this.repo.create(trx, {
        callUuid,
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        initiatedBy: input.callerId,
        callType: input.callType,
        status: 'initiated',
      });

      await this.repo.addParticipant(trx, {
        callId: id,
        userId: input.callerId,
        role: 'caller',
        status: 'accepted',
        deviceId: input.deviceId ?? null,
      });
      for (const callee of calleeIds) {
        await this.repo.addParticipant(trx, {
          callId: id,
          userId: callee,
          role: 'callee',
          status: 'invited',
        });
      }

      await this.repo.logEvent(trx, {
        callId: id,
        userId: input.callerId,
        eventType: 'call_initiated',
        metadata: { callType: input.callType, callees: calleeIds },
      });

      await this.repo.updateCallStatus(trx, id, { status: 'ringing' });
      await this.repo.updateParticipant(trx, id, input.callerId, { joined_at: new Date() });

      return id;
    });

    // Store ephemeral state in Redis (used for signal routing + busy checks).
    await this.redis.set(
      `call:${callId}:state`,
      JSON.stringify({ status: 'ringing', callType: input.callType, callees: calleeIds }),
      'EX',
      env.CALL_SIGNAL_TTL_SECONDS,
    );

    // Schedule timeout in the caller's API instance (best-effort; DB is authority).
    const ttlMs = env.CALL_RING_TIMEOUT_SECONDS * 1000;
    void this.scheduleTimeout(callId, input.tenantId, ttlMs);

    return this.getById(input.tenantId, callId);
  }

  async accept(input: {
    tenantId: number;
    callId: number;
    userId: number;
    deviceId?: string;
  }): Promise<CallDTO> {
    const call = await this.repo.findById(input.tenantId, input.callId);
    if (!call) throw new NotFoundError('Call not found');
    if (['ended', 'cancelled', 'rejected', 'missed', 'failed'].includes(call.status)) {
      throw new AppError('Call is no longer active', 'CALL_NOT_ACTIVE', 409);
    }

    const participant = await this.repo.findParticipant(input.callId, input.userId);
    if (!participant) throw new ForbiddenError('You are not a participant in this call');
    if (participant.status === 'accepted' || participant.status === 'connected') {
      // Idempotent
      return this.getById(input.tenantId, input.callId);
    }

    await this.db.transaction(async (trx) => {
      await this.repo.updateParticipant(trx, input.callId, input.userId, {
        status: 'accepted',
        joined_at: new Date(),
      });
      await this.repo.updateCallStatus(trx, input.callId, { status: 'connecting' });
      await this.repo.logEvent(trx, {
        callId: input.callId,
        userId: input.userId,
        eventType: 'call_accepted',
      });
    });

    await this.redis.set(
      `call:${input.callId}:state`,
      JSON.stringify({ status: 'connecting', callType: call.call_type }),
      'EX',
      env.CALL_SIGNAL_TTL_SECONDS,
    );

    return this.getById(input.tenantId, input.callId);
  }

  async markConnected(input: {
    tenantId: number;
    callId: number;
    userId: number;
  }): Promise<CallDTO> {
    const call = await this.repo.findById(input.tenantId, input.callId);
    if (!call) throw new NotFoundError('Call not found');

    const participant = await this.repo.findParticipant(input.callId, input.userId);
    if (!participant) throw new ForbiddenError('Not a participant');

    await this.db.transaction(async (trx) => {
      const patch: Record<string, unknown> = {
        status: 'connected' as CallStatus,
      };
      if (!call.connected_at) patch.connected_at = new Date();
      await this.repo.updateCallStatus(trx, input.callId, patch);
      await this.repo.updateParticipant(trx, input.callId, input.userId, {
        status: 'connected',
      });
      await this.repo.logEvent(trx, {
        callId: input.callId,
        userId: input.userId,
        eventType: 'call_connected',
      });
    });

    return this.getById(input.tenantId, input.callId);
  }

  async reject(input: {
    tenantId: number;
    callId: number;
    userId: number;
    reason?: 'rejected' | 'busy';
  }): Promise<void> {
    const call = await this.repo.findById(input.tenantId, input.callId);
    if (!call) throw new NotFoundError('Call not found');

    const participant = await this.repo.findParticipant(input.callId, input.userId);
    if (!participant) throw new ForbiddenError('Not a participant');

    const reason = input.reason ?? 'rejected';

    await this.db.transaction(async (trx) => {
      await this.repo.updateParticipant(trx, input.callId, input.userId, {
        status: reason === 'busy' ? 'rejected' : 'rejected',
        left_at: new Date(),
      });

      // For 1:1: rejecting ends the call outright.
      const parts = await this.repo.listParticipants(input.callId);
      const activeOthers = parts.filter(
        (p) =>
          p.user_id !== input.userId &&
          ['accepted', 'connected'].includes(p.status),
      );
      if (activeOthers.length === 0) {
        await this.repo.updateCallStatus(trx, input.callId, {
          status: 'rejected',
          ended_at: new Date(),
          end_reason: reason === 'busy' ? 'busy' : 'rejected',
        });
      }

      await this.repo.logEvent(trx, {
        callId: input.callId,
        userId: input.userId,
        eventType: reason === 'busy' ? 'call_busy' : 'call_rejected',
      });
    });

    await this.redis.del(`call:${input.callId}:state`);
  }

  async cancel(input: {
    tenantId: number;
    callId: number;
    userId: number;
  }): Promise<void> {
    const call = await this.repo.findById(input.tenantId, input.callId);
    if (!call) throw new NotFoundError('Call not found');
    if (call.initiated_by !== input.userId) {
      throw new ForbiddenError('Only the caller can cancel');
    }

    await this.db.transaction(async (trx) => {
      await this.repo.updateCallStatus(trx, input.callId, {
        status: 'cancelled',
        ended_at: new Date(),
        end_reason: 'user_cancelled',
      });
      const parts = await this.repo.listParticipants(input.callId);
      for (const p of parts) {
        if (p.status === 'connected' || p.status === 'accepted') continue;
        await this.repo.updateParticipant(trx, input.callId, p.user_id, {
          status: 'cancelled',
          left_at: new Date(),
        });
      }
      await this.repo.logEvent(trx, {
        callId: input.callId,
        userId: input.userId,
        eventType: 'call_cancelled',
      });
    });

    await this.redis.del(`call:${input.callId}:state`);
  }

  async end(input: {
    tenantId: number;
    callId: number;
    userId: number;
    reason?: 'completed' | 'remote_ended' | 'network_error';
  }): Promise<void> {
    const call = await this.repo.findById(input.tenantId, input.callId);
    if (!call) throw new NotFoundError('Call not found');

    const participant = await this.repo.findParticipant(input.callId, input.userId);
    if (!participant) throw new ForbiddenError('Not a participant');

    await this.db.transaction(async (trx) => {
      const now = new Date();

      // Duration from the moment the call actually connected (or started).
      const startRef = call.connected_at ?? call.started_at;
      const durationSeconds = Math.max(
        0,
        Math.round((now.getTime() - new Date(startRef).getTime()) / 1000),
      );

      await this.repo.updateParticipant(trx, input.callId, input.userId, {
        status: 'left',
        left_at: now,
        duration_seconds: durationSeconds,
      });

      // If no one else is still connected, end the call.
      const parts = await this.repo.listParticipants(input.callId);
      const stillActive = parts.filter(
        (p) =>
          p.user_id !== input.userId &&
          ['accepted', 'connected'].includes(p.status),
      );
      if (stillActive.length === 0) {
        await this.repo.updateCallStatus(trx, input.callId, {
          status: 'ended',
          ended_at: now,
          duration_seconds: durationSeconds,
          end_reason: input.reason ?? 'completed',
        });
      }

      await this.repo.logEvent(trx, {
        callId: input.callId,
        userId: input.userId,
        eventType: 'call_ended',
        metadata: { durationSeconds, reason: input.reason ?? 'completed' },
      });
    });

    await this.redis.del(`call:${input.callId}:state`);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  async getById(tenantId: number, callId: number): Promise<CallDTO> {
    const call = await this.repo.findById(tenantId, callId);
    if (!call) throw new NotFoundError('Call not found');
    const parts = await this.repo.listParticipants(callId);
    return this.serialize(call, parts);
  }

  async history(
    tenantId: number,
    userId: number,
    limit = 30,
    cursor?: string,
  ): Promise<{ items: CallDTO[]; nextCursor: string | null; hasMore: boolean }> {
    const cursorId = cursor ? Number(Buffer.from(cursor, 'base64url').toString('utf8')) : null;
    const rows = await this.repo.history(tenantId, userId, limit, cursorId);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Load participants for each call in a single round trip.
    const callIds = items.map((r) => r.id);
    const participantsByCall = new Map<number, CallParticipantRow[]>();
    if (callIds.length > 0) {
      const parts = await this.db('call_participants').whereIn('call_id', callIds);
      for (const p of parts) {
        const list = participantsByCall.get(p.call_id) ?? [];
        list.push(p as CallParticipantRow);
        participantsByCall.set(p.call_id, list);
      }
    }

    const dtos = items.map((r) =>
      this.serialize(r as CallRow, participantsByCall.get(r.id) ?? []),
    );

    const last = items[items.length - 1];
    return {
      items: dtos,
      hasMore,
      nextCursor:
        hasMore && last ? Buffer.from(String(last.id), 'utf8').toString('base64url') : null,
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async scheduleTimeout(
    callId: number,
    tenantId: number,
    ttlMs: number,
  ): Promise<void> {
    // Best-effort timeout: on the timeout, if the call hasn't progressed,
    // mark it missed. This runs in-process only; the DB is the source of truth.
    setTimeout(async () => {
      try {
        const call = await this.repo.findById(tenantId, callId);
        if (!call) return;
        if (call.status !== 'ringing' && call.status !== 'initiated') return;

        const parts = await this.repo.listParticipants(callId);
        const anyoneAccepted = parts.some((p) => p.status === 'accepted' || p.status === 'connected');
        if (anyoneAccepted) return;

        await this.db.transaction(async (trx) => {
          await this.repo.updateCallStatus(trx, callId, {
            status: 'missed',
            ended_at: new Date(),
            end_reason: 'timeout',
          });
          for (const p of parts) {
            if (p.status === 'invited' || p.status === 'ringing') {
              await this.repo.updateParticipant(trx, callId, p.user_id, {
                status: 'missed',
                left_at: new Date(),
              });
            }
          }
          await this.repo.logEvent(trx, {
            callId,
            userId: null,
            eventType: 'call_timeout',
          });
        });
      } catch {
        /* best-effort */
      }
    }, ttlMs).unref();
  }

  private serialize(call: CallRow, parts: CallParticipantRow[]): CallDTO {
    return {
      id: call.id,
      callUuid: call.call_uuid,
      conversationId: call.conversation_id,
      initiatedBy: call.initiated_by,
      callType: call.call_type,
      status: call.status,
      startedAt: new Date(call.started_at).toISOString(),
      connectedAt: call.connected_at ? new Date(call.connected_at).toISOString() : null,
      endedAt: call.ended_at ? new Date(call.ended_at).toISOString() : null,
      durationSeconds: call.duration_seconds,
      endReason: call.end_reason,
      participants: parts.map<CallParticipantDTO>((p) => ({
        userId: p.user_id,
        role: p.role,
        status: p.status,
        invitedAt: new Date(p.invited_at).toISOString(),
        joinedAt: p.joined_at ? new Date(p.joined_at).toISOString() : null,
        leftAt: p.left_at ? new Date(p.left_at).toISOString() : null,
        durationSeconds: p.duration_seconds,
        micMuted: Boolean(p.mic_muted),
        cameraEnabled: Boolean(p.camera_enabled),
        screenSharing: Boolean(p.screen_sharing),
      })),
    };
  }
}