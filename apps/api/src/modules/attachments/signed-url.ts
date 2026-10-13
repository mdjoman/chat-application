import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Generate a short-lived HMAC-signed URL for an attachment.
 * Uses WIDGET_SHARED_SECRET as the signing key (or a dedicated one).
 *
 * Format: <baseUrl>/api/v1/attachments/:id?exp=<unix>&sig=<hmac>
 * Sig = HMAC-SHA256(secret, `${id}.${exp}`)
 */
export function signAttachmentUrl(attachmentId: number, baseUrl: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const hmac = crypto.createHmac('sha256', env.WIDGET_SHARED_SECRET);
  hmac.update(`${attachmentId}.${exp}`);
  const sig = hmac.digest('base64url');
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/attachments/${attachmentId}?exp=${exp}&sig=${sig}`;
  return url;
}

export function verifyAttachmentSignature(
  attachmentId: number,
  exp: number,
  sig: string,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) return false;
  const hmac = crypto.createHmac('sha256', env.WIDGET_SHARED_SECRET);
  hmac.update(`${attachmentId}.${exp}`);
  const expected = hmac.digest('base64url');
  // Timing-safe compare
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}