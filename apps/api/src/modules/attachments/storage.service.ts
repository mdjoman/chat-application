import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

import { env } from '../../config/env.js';

export interface StoredFile {
  key: string;
  absPath: string;
  size: number;
  sha256: string;
}

export class StorageService {
  private readonly root: string;

  constructor() {
    this.root = path.resolve(process.cwd(), env.UPLOAD_DIR);
    fs.mkdirSync(this.root, { recursive: true });
  }

  async save(opts: {
    tenantId: number;
    stream: Readable;
    originalName: string;
    mimeType: string;
  }): Promise<StoredFile> {
    const now = new Date();
    const rel = path.join(
      `t${opts.tenantId}`,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${crypto.randomUUID()}${path.extname(opts.originalName).slice(0, 10)}`,
    );
    const absPath = path.join(this.root, rel);

    await fsp.mkdir(path.dirname(absPath), { recursive: true });

    const hash = crypto.createHash('sha256');
    let size = 0;

    const out = fs.createWriteStream(absPath);
    opts.stream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      size += chunk.length;
    });
    await pipeline(opts.stream, out);

    return { key: rel, absPath, size, sha256: hash.digest('hex') };
  }

  absPath(key: string): string {
    const safe = path.normalize(key).replace(/^(\.\.[/\\])+/, '');
    return path.join(this.root, safe);
  }

  async exists(key: string): Promise<boolean> {
    try { await fsp.access(this.absPath(key)); return true; } catch { return false; }
  }

  async delete(key: string): Promise<void> {
    try { await fsp.unlink(this.absPath(key)); } catch { /* ignore */ }
  }
}

export const storage = new StorageService();
