import type { Knex } from 'knex';
import { randomUUID } from 'node:crypto';

import { AppError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { env } from '../../config/env.js';
import { AttachmentsRepository, type AttachmentRow } from './attachments.repository.js';
import { storage } from './storage.service.js';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'application/pdf',
  'text/plain',
]);

export class AttachmentsService {
  private readonly repo: AttachmentsRepository;
  constructor(private readonly db: Knex) {
    this.repo = new AttachmentsRepository(db);
  }

  async upload(input: {
    tenantId: number;
    userId: number;
    buffer: Buffer;
    mimeType: string;
    originalName?: string;
  }): Promise<{ id: number; url: string; mimeType: string; sizeBytes: number }> {
    if (!ALLOWED_MIME.has(input.mimeType)) {
      throw new AppError('Unsupported file type', 'UNSUPPORTED_MEDIA', 415);
    }
    if (input.buffer.length > env.MAX_UPLOAD_BYTES) {
      throw new AppError('File too large', 'PAYLOAD_TOO_LARGE', 413);
    }

    const stored = await storage.upload(input.buffer, {
      tenantId: input.tenantId,
      mimeType: input.mimeType,
      originalName: input.originalName,
    });

    const id = await this.db.transaction(async (trx) =>
      this.repo.create(trx, {
        tenantId: input.tenantId,
        uploadedBy: input.userId,
        storageKey: stored.key,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        originalName: input.originalName ?? null,
      }),
    );

    return {
      id,
      url: `/api/v1/attachments/${id}`,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
    };
  }

  async attachToMessage(tenantId: number, userId: number, messageId: number, ids: number[]): Promise<void> {
    const rows = await this.repo.findOrphansByIds(tenantId, userId, ids);
    if (rows.length !== ids.length) {
      throw new ForbiddenError('Some attachments are not yours or already used');
    }
    await this.db.transaction(async (trx) => {
      await this.repo.attachToMessage(trx, ids, messageId, tenantId);
    });
  }

  async getForDownload(tenantId: number, id: number): Promise<{ row: AttachmentRow; absPath: string }> {
    const row = await this.repo.findById(tenantId, id);
    if (!row) throw new NotFoundError('Attachment not found');
    const absPath = storage.absolutePath(row.storage_key);
    const exists = await storage.exists(row.storage_key);
    if (!exists) throw new NotFoundError('File missing on disk');
    return { row, absPath };
  }
}
