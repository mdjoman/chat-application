import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

export interface StoredFile {
  key: string;
  size: number;
  contentType: string;
  originalName?: string;
}

export interface StorageService {
  upload(buffer: Buffer, opts: {
    tenantId: number;
    mimeType: string;
    originalName?: string;
  }): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  absolutePath(key: string): string;
  exists(key: string): Promise<boolean>;
}

const ROOT = env.STORAGE_LOCAL_DIR || path.resolve(process.cwd(), 'storage');

/**
 * Local filesystem storage. Swap for S3StorageService later
 * without touching message/attachment logic.
 */
export class LocalStorageService implements StorageService {
  async upload(buffer: Buffer, opts: {
    tenantId: number;
    mimeType: string;
    originalName?: string;
  }): Promise<StoredFile> {
    const ext = extFromMime(opts.mimeType) || path.extname(opts.originalName || '') || '';
    const key = `${opts.tenantId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext}`;
    const full = path.join(ROOT, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return { key, size: buffer.length, contentType: opts.mimeType, originalName: opts.originalName };
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(path.join(ROOT, key));
    } catch {
      /* ignore */
    }
  }

  absolutePath(key: string): string {
    return path.join(ROOT, key);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(path.join(ROOT, key));
      return true;
    } catch {
      return false;
    }
  }
}

export const storage: StorageService = new LocalStorageService();

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
  };
  return map[mime] ?? '';
}
