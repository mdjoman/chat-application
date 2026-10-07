import type { Knex } from 'knex';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

import { AppError, ConflictError, UnauthorizedError } from '../../utils/errors.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

export interface AuthContext {
  userAgent?: string;
  ip?: string;
  deviceId?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  user: PublicUser;
}

export interface PublicUser {
  id: number;
  tenantId: number;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  role: string;
}

interface UserRow {
  id: number;
  tenant_id: number;
  external_id: string | null;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  avatar_url: string | null;
  role: string;
  is_active: 0 | 1;
}

export class AuthService {
  private readonly tokens: TokenService;

  constructor(
    private readonly db: Knex,
    private readonly redis: Redis,
  ) {
    this.tokens = new TokenService(db, redis);
  }

  get tokenService(): TokenService {
    return this.tokens;
  }

  // ---------- Register (email/password) ----------
  async register(input: {
    tenantId: number;
    username: string;
    email?: string;
    password: string;
    displayName?: string;
  }, ctx: AuthContext): Promise<IssuedTokens> {
    const username = input.username.trim().toLowerCase();
    const email = input.email?.trim().toLowerCase() || null;

    const existing = await this.db('users')
      .where({ tenant_id: input.tenantId, username })
      .first();
    if (existing) throw new ConflictError('Username already taken');

    if (email) {
      const existingEmail = await this.db('users')
        .where({ tenant_id: input.tenantId, email })
        .first();
      if (existingEmail) throw new ConflictError('Email already registered');
    }

    const passwordHash = await PasswordService.hash(input.password);

    const trxResult = await this.db.transaction(async (trx) => {
      const [id] = await trx('users').insert({
        tenant_id: input.tenantId,
        username,
        email,
        display_name: input.displayName?.trim() || username,
        password_hash: passwordHash,
        role: 'user',
      });
      await trx('user_settings').insert({ user_id: id });
      return Number(id);
    });

    const user = await this.getUserOrThrow(trxResult);
    return this.issueSession(user, ctx);
  }

  // ---------- Login (email/password) ----------
  async login(input: {
    tenantId: number;
    identifier: string; // username or email
    password: string;
  }, ctx: AuthContext): Promise<IssuedTokens> {
    const identifier = input.identifier.trim().toLowerCase();

    const row: UserRow | undefined = await this.db('users')
      .where({ tenant_id: input.tenantId })
      .andWhere((b) => b.where('username', identifier).orWhere('email', identifier))
      .first();

    if (!row || !row.password_hash) {
      throw new UnauthorizedError('Invalid credentials');
    }
    if (!row.is_active) {
      throw new UnauthorizedError('Account disabled');
    }
    const ok = await PasswordService.verify(row.password_hash, input.password);
    if (!ok) throw new UnauthorizedError('Invalid credentials');

    const user = await this.getUserOrThrow(row.id);
    return this.issueSession(user, ctx);
  }

  // ---------- Widget login ----------
  async widgetLogin(widgetToken: string, ctx: AuthContext): Promise<IssuedTokens> {
    const claims = await this.tokens.verifyWidgetToken(widgetToken);

    const tenant = await this.db('tenants').where({ slug: claims.tenantSlug }).first();
    if (!tenant || !tenant.is_active) {
      throw new UnauthorizedError('Tenant not found or inactive');
    }

    const externalId = String(claims.sub);
    let row: UserRow | undefined = await this.db('users')
      .where({ tenant_id: tenant.id, external_id: externalId })
      .first();

    if (!row) {
      const username = `u_${externalId}`.slice(0, 64).toLowerCase();
      const trxId = await this.db.transaction(async (trx) => {
        const [id] = await trx('users').insert({
          tenant_id: tenant.id,
          external_id: externalId,
          username,
          display_name: claims.name ?? username,
          email: claims.email ?? null,
          role: 'user',
        });
        await trx('user_settings').insert({ user_id: id });
        return Number(id);
      });
      row = (await this.db('users').where({ id: trxId }).first()) as UserRow;
    } else {
      // Refresh profile fields on each login
      await this.db('users').where({ id: row.id }).update({
        display_name: claims.name ?? row.display_name,
        email: claims.email ?? row.email,
        updated_at: this.db.fn.now(),
      });
    }

    const user = await this.getUserOrThrow(row.id);
    return this.issueSession(user, ctx);
  }

  // ---------- Refresh ----------
  async refresh(refreshToken: string, ctx: AuthContext): Promise<IssuedTokens> {
    const record = await this.tokens.verifyRefreshToken(refreshToken);
    const user = await this.getUserOrThrow(record.userId);

    // Rotation
    const next = await this.tokens.rotateRefreshToken(record, {
      deviceId: ctx.deviceId,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });

    const access = await this.tokens.issueAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return {
      accessToken: access.token,
      refreshToken: next.token,
      accessExpiresIn: access.expiresIn,
      user,
    };
  }

  // ---------- Logout ----------
  async logout(input: { refreshToken?: string; accessJti?: string; accessTtlSeconds?: number }): Promise<void> {
    if (input.refreshToken) {
      await this.tokens.revokeRefreshToken(input.refreshToken);
    }
    if (input.accessJti && input.accessTtlSeconds && input.accessTtlSeconds > 0) {
      await this.tokens.revokeJti(input.accessJti, input.accessTtlSeconds);
    }
  }

  // ---------- Helpers ----------
  private async issueSession(user: PublicUser, ctx: AuthContext): Promise<IssuedTokens> {
    const access = await this.tokens.issueAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    const refresh = await this.tokens.issueRefreshToken({
      userId: user.id,
      deviceId: ctx.deviceId,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });

    // Track device if deviceId provided
    if (ctx.deviceId) {
      await this.db('user_devices')
        .insert({
          user_id: user.id,
          device_id: ctx.deviceId,
          platform: 'web',
          user_agent: ctx.userAgent ?? null,
          last_active_at: this.db.fn.now(),
        })
        .onConflict(['user_id', 'device_id'])
        .merge({ last_active_at: this.db.fn.now(), user_agent: ctx.userAgent ?? null });
    }

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      accessExpiresIn: access.expiresIn,
      user,
    };
  }

  private async getUserOrThrow(id: number): Promise<PublicUser> {
    const row: UserRow | undefined = await this.db('users').where({ id }).first();
    if (!row) throw new AppError('User not found', 'USER_NOT_FOUND', 404);
    if (!row.is_active) throw new UnauthorizedError('Account disabled');
    return {
      id: row.id,
      tenantId: row.tenant_id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      role: row.role,
    };
  }
}
