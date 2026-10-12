import crypto from 'node:crypto';
import type { Knex } from 'knex';
import type Redis from 'ioredis';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError, ValidationError } from '../../utils/errors.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

export class PasswordResetService {
  private readonly tokens: TokenService;

  constructor(
    private readonly db: Knex,
    private readonly redis: Redis,
  ) {
    this.tokens = new TokenService(db, redis);
  }

  /**
   * Request a reset. Always returns { ok: true } to avoid leaking which
   * emails/usernames exist. In dev, also returns the token+url so you can
   * test without an email provider.
   */
  async request(input: {
    tenantId: number;
    identifier: string; // username or email
    ip?: string;
  }): Promise<{
    ok: true;
    devResetUrl?: string;
    devToken?: string;
  }> {
    const identifier = input.identifier.trim().toLowerCase();

    const user: { id: number; email: string | null } | undefined = await this.db('users')
      .where({ tenant_id: input.tenantId })
      .andWhere((b) => b.where('username', identifier).orWhere('email', identifier))
      .where({ is_active: 1 })
      .first();

    if (!user) {
      // Silent: do not disclose non-existence
      return { ok: true };
    }

    // Throttle: at most one active token per user per 60 seconds
    const throttleKey = `pwreset:throttle:${user.id}`;
    const existing = await this.redis.get(throttleKey);
    if (existing) {
      return { ok: true };
    }
    await this.redis.set(throttleKey, '1', 'EX', 60);

    // Generate a fresh token
    const raw = crypto.randomBytes(48).toString('base64url');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL * 1000);

    await this.db.transaction(async (trx) => {
      // Invalidate previous unused tokens for this user
      await trx('password_resets')
        .where({ user_id: user.id })
        .whereNull('used_at')
        .update({ used_at: trx.fn.now() });

      await trx('password_resets').insert({
        user_id: user.id,
        token_hash: hash,
        expires_at: expiresAt,
        requested_ip: input.ip ?? null,
      });
    });

    const resetUrl = `${env.PASSWORD_RESET_URL}?token=${raw}`;

    // Email delivery would go here (Phase 6.5 adds SMTP). For now:
    logger.info(
      { userId: user.id, url: resetUrl },
      'password reset requested — wire SMTP to email this URL',
    );

    if (!env.NODE_ENV || env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
      // Return the token in dev/test only, so the widget can offer a
      // "reset link" without an email server.
      return { ok: true, devResetUrl: resetUrl, devToken: raw };
    }

    return { ok: true };
  }

  /**
   * Confirm reset. Rotates the password, marks the token used, and
   * revokes all sessions.
   */
  async confirm(input: {
    token: string;
    newPassword: string;
  }): Promise<{ ok: true }> {
    if (input.newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const hash = crypto.createHash('sha256').update(input.token).digest('hex');

    const row = await this.db('password_resets')
      .where({ token_hash: hash })
      .whereNull('used_at')
      .first();

    if (!row) throw new AppError('Invalid or already-used token', 'RESET_INVALID', 400);
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new AppError('Reset token expired', 'RESET_EXPIRED', 400);
    }

    const newHash = await PasswordService.hash(input.newPassword);

    await this.db.transaction(async (trx) => {
      await trx('users').where({ id: row.user_id }).update({
        password_hash: newHash,
        updated_at: trx.fn.now(),
      });

      await trx('password_resets')
        .where({ id: row.id })
        .update({ used_at: trx.fn.now() });

      // Revoke all refresh tokens — force every device to log in again
      await trx('refresh_tokens')
        .where({ user_id: row.user_id })
        .whereNull('revoked_at')
        .update({ revoked_at: trx.fn.now() });
    });

    logger.info({ userId: row.user_id }, 'password reset confirmed');
    return { ok: true };
  }

  async validateToken(token: string): Promise<{ valid: boolean; expiresAt?: string }> {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await this.db('password_resets')
      .where({ token_hash: hash })
      .whereNull('used_at')
      .first();
    if (!row) return { valid: false };
    if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false };
    return { valid: true, expiresAt: new Date(row.expires_at).toISOString() };
  }
}
