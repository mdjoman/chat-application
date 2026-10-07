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

  async create(trx: Knex.Transaction, row: {
    tenantId: number;
    uploadedBy: number;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    originalName?: string | null;
    metadata?: Record<string, unknown> | null;
    messageId?: number | null;
  }): Promise<number> {
    const [id] = await trx('attachments').insert({
      tenant_id: row.tenantId,
      uploaded_by: row.uploadedBy,
      storage_key: row.storageKey,
      mime_type: row.mimeType,
      size_bytes: row.sizeBytes,
      original_name: row.originalName ?? null,
      metadata: row.metadata ? JSON.stringify(row.metadata) : null,
      message_id: row.messageId ?? null,
    });
    return Number(id);
  }

  async attachToMessage(
    trx: Knex.Transaction,
    attachmentIds: number[],
    messageId: number,
    tenantId: number,
  ): Promise<void> {
    if (attachmentIds.length === 0) return;
    await trx('attachments')
      .where({ tenant_id: tenantId })
      .whereIn('id', attachmentIds)
      .whereNull('message_id')
      .update({ message_id: messageId });
  }

  async findById(tenantId: number, id: number): Promise<AttachmentRow | undefined> {
    return this.db('attachments').where({ tenant_id: tenantId, id }).first();
  }

  async findOrphansByIds(
    tenantId: number,
    userId: number,
    ids: number[],
  ): Promise<AttachmentRow[]> {
    if (ids.length === 0) return [];
    return this.db('attachments')
      .where({ tenant_id: tenantId, uploaded_by: userId })
      .whereIn('id', ids);
  }
}
