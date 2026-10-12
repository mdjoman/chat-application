import type { Knex } from 'knex';
import type { Readable } from 'node:stream';
import { promises as fsp } from 'node:fs';

import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { allowedMimeTypes, env } from '../../config/env.js';
import { storage } from './storage.service.js';
import { AttachmentsRepository, type AttachmentRow } from './attachments.repository.js';

const MAGIC: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { mime: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] },
  { mime: 'audio/ogg', bytes: [0x4f, 0x67, 0x67, 0x53] },
];

function sniffMime(header: Buffer): string | null {
  for (const sig of MAGIC) {
    const off = sig.offset ?? 0;
    if (header.length < off + sig.bytes.length) continue;
    let ok = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (header[off + i] !== sig.bytes[i]) { ok = false; break; }
    }
    if (ok) return sig.mime;
  }
  return null;
}

export interface AttachmentDTO {
  id: number;
  messageId: number | null;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  url: string;
  metadata: Record<string, unknown> | null;
}

export class AttachmentsService {
  private readonly repo: AttachmentsRepository;

  constructor(private readonly db: Knex) {
    this.repo = new AttachmentsRepository(db);
  }

  async upload(input: {
    tenantId: number;
    userId: number;
    stream: Readable;
    originalName: string;
    declaredMime: string;
  }): Promise<AttachmentDTO> {
    const declared = (input.declaredMime || 'application/octet-stream').toLowerCase();
    if (!allowedMimeTypes.includes(declared)) {
      throw new ValidationError(`MIME type not allowed: ${declared}`);
    }

    const stored = await storage.save({
      tenantId: input.tenantId,
      stream: input.stream,
      originalName: input.originalName,
      mimeType: declared,
    });

    if (stored.size > env.UPLOAD_MAX_BYTES) {
      await storage.delete(stored.key);
      throw new ValidationError('File too large');
    }

    const fh = await fsp.open(stored.absPath, 'r');
    const buf = Buffer.alloc(512);
    try { await fh.read(buf, 0, 512, 0); } finally { await fh.close(); }
    const sniffed = sniffMime(buf);
    if (sniffed && !allowedMimeTypes.includes(sniffed)) {
      await storage.delete(stored.key);
      throw new ValidationError(`File content does not match allowed types (${sniffed})`);
    }

    const id = await this.db.transaction(async (trx) => {
      return this.repo.insert(trx, {
        messageId: null,
        tenantId: input.tenantId,
        uploadedBy: input.userId,
        storageKey: stored.key,
        mimeType: sniffed ?? declared,
        sizeBytes: stored.size,
        originalName: input.originalName.slice(0, 255),
        metadata: { sha256: stored.sha256 },
      });
    });

    return {
      id,
      messageId: null,
      mimeType: sniffed ?? declared,
      sizeBytes: stored.size,
      originalName: input.originalName,
      url: `${env.PUBLIC_API_BASE_URL}/api/v1/attachments/${id}`,
      metadata: { sha256: stored.sha256 },
    };
  }

  async attachToMessage(
    trx: Knex.Transaction,
    tenantId: number,
    messageId: number,
    attachmentIds: number[],
  ): Promise<void> {
    if (attachmentIds.length === 0) return;

    const rows: AttachmentRow[] = await trx('attachments')
      .where({ tenant_id: tenantId })
      .whereIn('id', attachmentIds);

    if (rows.length !== attachmentIds.length) throw new NotFoundError('One or more attachments not found');
    for (const r of rows) {
      if (r.message_id !== null) throw new ForbiddenError('Attachment already attached');
    }
    await this.repo.attachToMessage(trx, attachmentIds, messageId, tenantId);
  }

  async loadForMessages(tenantId: number, messageIds: number[]): Promise<Map<number, AttachmentDTO[]>> {
    const map = new Map<number, AttachmentDTO[]>();
    if (messageIds.length === 0) return map;
    const rows: AttachmentRow[] = await this.db('attachments')
      .where({ tenant_id: tenantId })
      .whereIn('message_id', messageIds);
    for (const r of rows) {
      if (r.message_id == null) continue;
      const arr = map.get(r.message_id) ?? [];
      arr.push(this.toDTO(r));
      map.set(r.message_id, arr);
    }
    return map;
  }

  async getForDownload(tenantId: number, id: number): Promise<{
    absPath: string; mimeType: string; sizeBytes: number; originalName: string | null;
  }> {
    const row = await this.repo.findById(tenantId, id);
    if (!row) throw new NotFoundError('Attachment not found');
    return {
      absPath: storage.absPath(row.storage_key),
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      originalName: row.original_name,
    };
  }

  toDTO(r: AttachmentRow): AttachmentDTO {
    return {
      id: r.id,
      messageId: r.message_id,
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes),
      originalName: r.original_name,
      url: `${env.PUBLIC_API_BASE_URL}/api/v1/attachments/${r.id}`,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
    };
  }
}
