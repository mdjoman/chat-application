import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import crypto from 'node:crypto';
import type { Knex } from 'knex';
import type Redis from 'ioredis';

import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../utils/errors.js';

const ACCESS_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const WIDGET_SECRET = new TextEncoder().encode(env.WIDGET_SHARED_SECRET);

export interface AccessTokenClaims extends JWTPayload {
  sub: string;      // userId
  tenantId: number;
  role: string;
  type: 'access';
}

export interface WidgetTokenClaims extends JWTPayload {
  sub: string;      // external user id
  appId: string;
  tenantSlug: string;
  name?: string;
  email?: string;
}

export interface RefreshRecord {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

export class TokenService {
  constructor(
    private readonly db: Knex,
    private readonly redis: Redis,
  ) {}

  // ---------- Access tokens (JWT) ----------
  async issueAccessToken(input: {
    userId: number;
    tenantId: number;
    role: string;
  }): Promise<{ token: string; expiresIn: number; jti: string }> {
    const jti = crypto.randomUUID();
    const token = await new SignJWT({
      tenantId: input.tenantId,
      role: input.role,
      type: 'access',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(input.userId))
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(`${env.JWT_ACCESS_TTL}s`)
      .sign(ACCESS_SECRET);

    return { token, expiresIn: env.JWT_ACCESS_TTL, jti };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, ACCESS_SECRET);
      if (payload.type !== 'access' || !payload.sub || !payload.jti) {
        throw new UnauthorizedError('Invalid token payload');
      }
      // Revocation check
      const revoked = await this.redis.get(`revoked:jti:${payload.jti}`);
      if (revoked) throw new UnauthorizedError('Token revoked');
      return payload as AccessTokenClaims;
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  async revokeJti(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds > 0) {
      await this.redis.set(`revoked:jti:${jti}`, '1', 'EX', ttlSeconds);
    }
  }

  // ---------- Refresh tokens (opaque, hashed in DB) ----------
  async issueRefreshToken(input: {
    userId: number;
    deviceId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ token: string; record: RefreshRecord }> {
    const raw = crypto.randomBytes(48).toString('base64url');
    const hash = this.hashRefresh(raw);
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);

    const [id] = await this.db('refresh_tokens').insert({
      user_id: input.userId,
      token_hash: hash,
      device_id: input.deviceId ?? null,
      user_agent: input.userAgent ?? null,
      ip_address: input.ip ?? null,
      expires_at: expiresAt,
    });

    return {
      token: raw,
      record: { id: Number(id), userId: input.userId, tokenHash: hash, expiresAt },
    };
  }

  async verifyRefreshToken(raw: string): Promise<RefreshRecord> {
    const hash = this.hashRefresh(raw);
    const row = await this.db('refresh_tokens')
      .where({ token_hash: hash })
      .whereNull('revoked_at')
      .first();

    if (!row) throw new UnauthorizedError('Invalid refresh token');
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedError('Refresh token expired');
    }
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
    };
  }

  async rotateRefreshToken(
    oldRecord: RefreshRecord,
    input: { deviceId?: string; userAgent?: string; ip?: string },
  ): Promise<{ token: string; record: RefreshRecord }> {
    const next = await this.issueRefreshToken({
      userId: oldRecord.userId,
      ...input,
    });
    await this.db('refresh_tokens')
      .where({ id: oldRecord.id })
      .update({ revoked_at: this.db.fn.now(), replaced_by_id: next.record.id });
    return next;
  }

  async revokeRefreshToken(raw: string): Promise<void> {
    const hash = this.hashRefresh(raw);
    await this.db('refresh_tokens')
      .where({ token_hash: hash })
      .whereNull('revoked_at')
      .update({ revoked_at: this.db.fn.now() });
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.db('refresh_tokens')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .update({ revoked_at: this.db.fn.now() });
  }

  // ---------- Widget tokens ----------
  async verifyWidgetToken(token: string): Promise<WidgetTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, WIDGET_SECRET, {
        algorithms: ['HS256'],
      });
      if (!payload.sub || !payload.appId || !payload.tenantSlug) {
        throw new UnauthorizedError('Invalid widget token claims');
      }
      return payload as WidgetTokenClaims;
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Invalid widget token');
    }
  }

  private hashRefresh(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
