import type { Knex } from 'knex';
import type {
  CallType,
  CallStatus,
  CallEndReason,
  CallParticipantStatus,
} from '@chat/shared-types';

export interface CallRow {
  id: number;
  call_uuid: string;
  tenant_id: number;
  conversation_id: number;
  initiated_by: number;
  call_type: CallType;
  status: CallStatus;
  started_at: Date;
  connected_at: Date | null;
  ended_at: Date | null;
  duration_seconds: number | null;
  end_reason: CallEndReason | null;
  created_at: Date;
  updated_at: Date;
}

export interface CallParticipantRow {
  id: number;
  call_id: number;
  user_id: number;
  role: 'caller' | 'callee';
  status: CallParticipantStatus;
  invited_at: Date;
  joined_at: Date | null;
  left_at: Date | null;
  duration_seconds: number | null;
  mic_muted: 0 | 1;
  camera_enabled: 0 | 1;
  screen_sharing: 0 | 1;
  device_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class CallsRepository {
  constructor(private readonly db: Knex) {}

  async create(
    trx: Knex.Transaction,
    input: {
      callUuid: string;
      tenantId: number;
      conversationId: number;
      initiatedBy: number;
      callType: CallType;
      status: CallStatus;
    },
  ): Promise<number> {
    const result = await trx('calls').insert({
      call_uuid: input.callUuid,
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      initiated_by: input.initiatedBy,
      call_type: input.callType,
      status: input.status,
    });
    const raw = Array.isArray(result) ? result[0] : result;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new Error(`calls.create: unexpected insert id ${String(raw)}`);
    }
    return numeric;
  }

  async addParticipant(
    trx: Knex.Transaction,
    input: {
      callId: number;
      userId: number;
      role: 'caller' | 'callee';
      status: CallParticipantStatus;
      deviceId?: string | null;
    },
  ): Promise<number> {
    const result = await trx('call_participants').insert({
      call_id: input.callId,
      user_id: input.userId,
      role: input.role,
      status: input.status,
      device_id: input.deviceId ?? null,
    });
    const raw = Array.isArray(result) ? result[0] : result;
    return Number(raw);
  }

  async logEvent(
    trx: Knex.Transaction | Knex,
    input: {
      callId: number;
      userId: number | null;
      eventType: string;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    await trx('call_events').insert({
      call_id: input.callId,
      user_id: input.userId,
      event_type: input.eventType,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
  }

  async findById(tenantId: number, id: number): Promise<CallRow | undefined> {
    return this.db('calls').where({ tenant_id: tenantId, id }).first();
  }

  async findByUuid(tenantId: number, uuid: string): Promise<CallRow | undefined> {
    return this.db('calls').where({ tenant_id: tenantId, call_uuid: uuid }).first();
  }

  async findActiveForUser(
    tenantId: number,
    userId: number,
  ): Promise<CallRow | undefined> {
    // A call is "active" for a user if their participant row is in a
    // non-terminal status and the call itself is not ended.
    const row = await this.db('calls as c')
      .join('call_participants as p', 'p.call_id', 'c.id')
      .where('c.tenant_id', tenantId)
      .where('p.user_id', userId)
      .whereIn('p.status', ['invited', 'ringing', 'accepted', 'connected'])
      .whereIn('c.status', [
        'initiated',
        'ringing',
        'accepted',
        'connecting',
        'connected',
      ])
      .orderBy('c.id', 'desc')
      .select('c.*')
      .first();
    return row;
  }

  async listParticipants(callId: number): Promise<CallParticipantRow[]> {
    return this.db('call_participants').where({ call_id: callId }).orderBy('id', 'asc');
  }

  async findParticipant(
    callId: number,
    userId: number,
  ): Promise<CallParticipantRow | undefined> {
    return this.db('call_participants').where({ call_id: callId, user_id: userId }).first();
  }

  async updateCallStatus(
    trx: Knex.Transaction,
    callId: number,
    patch: Partial<{
      status: CallStatus;
      connected_at: Date;
      ended_at: Date;
      duration_seconds: number;
      end_reason: CallEndReason;
    }>,
  ): Promise<void> {
    await trx('calls')
      .where({ id: callId })
      .update({ ...patch, updated_at: trx.fn.now() });
  }

  async updateParticipant(
    trx: Knex.Transaction | Knex,
    callId: number,
    userId: number,
    patch: Partial<{
      status: CallParticipantStatus;
      joined_at: Date;
      left_at: Date;
      duration_seconds: number;
      mic_muted: 0 | 1;
      camera_enabled: 0 | 1;
      screen_sharing: 0 | 1;
    }>,
  ): Promise<void> {
    await trx('call_participants')
      .where({ call_id: callId, user_id: userId })
      .update({ ...patch, updated_at: trx.fn.now() });
  }

  async history(
    tenantId: number,
    userId: number,
    limit: number,
    cursorId: number | null,
  ): Promise<
    Array<
      CallRow & { participants_count: number; my_status: CallParticipantStatus; my_role: 'caller' | 'callee' }
    >
  > {
    const q = this.db('calls as c')
      .join('call_participants as p_me', (j) =>
        j.on('p_me.call_id', '=', 'c.id').andOn('p_me.user_id', '=', this.db.raw('?', [userId])),
      )
      .where('c.tenant_id', tenantId)
      .select(
        'c.*',
        'p_me.status as my_status',
        'p_me.role as my_role',
        this.db.raw(
          '(SELECT COUNT(*) FROM call_participants WHERE call_id = c.id) as participants_count',
        ),
      )
      .orderBy('c.id', 'desc')
      .limit(limit + 1);
    if (cursorId) q.andWhere('c.id', '<', cursorId);
    return q;
  }
}