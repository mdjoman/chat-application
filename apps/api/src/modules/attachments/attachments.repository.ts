import type { Knex } from 'knex';

export interface AttachmentRow {
  id: number;
  message_id: number | null;
  tenant_id: number;
  uploaded_by: number | null;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  original_name: string | null;
  metadata: unknown;
  created_at: Date;
}

export class AttachmentsRepository {
  constructor(private readonly db: Knex) {}

  async insert(
    trx: Knex.Transaction,
    input: {
      messageId: number | null;
      tenantId: number;
      uploadedBy: number;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      originalName: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<number> {
    const result = await trx('attachments').insert({
      message_id: input.messageId,
      tenant_id: input.tenantId,
      uploaded_by: input.uploadedBy,
      storage_key: input.storageKey,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      original_name: input.originalName,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    const rawId = Array.isArray(result) ? result[0] : result;
    const numericId = Number(rawId);
    if (!Number.isFinite(numericId)) throw new Error('attachment insert failed');
    return numericId;
  }

  async findById(tenantId: number, id: number): Promise<AttachmentRow | undefined> {
    return this.db('attachments').where({ tenant_id: tenantId, id }).first();
  }

  async attachToMessage(
    trx: Knex.Transaction,
    ids: number[],
    messageId: number,
    tenantId: number,
  ): Promise<void> {
    if (ids.length === 0) return;
    await trx('attachments')
      .where({ tenant_id: tenantId })
      .whereIn('id', ids)
      .update({ message_id: messageId });
  }
}
