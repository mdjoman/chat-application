import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { env } from '../../config/env.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../utils/errors.js';
import { authenticate } from '../../middleware/authenticate.js';
import { AuthService } from './auth.service.js';
import { PasswordResetService } from './password-reset.service.js';
import {
  LoginSchema,
  LogoutSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  PasswordResetValidateSchema,
  RefreshSchema,
  RegisterSchema,
  WidgetTokenSchema,
} from './auth.schemas.js';
import { TokenService } from './token.service.js';

function ctxFrom(req: FastifyRequest) {
  return {
    userAgent: req.headers['user-agent'] as string | undefined,
    ip: req.ip,
    deviceId: (req.headers['x-device-id'] as string | undefined) || undefined,
  };
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = new AuthService(fastify.db, fastify.redis);
  const tokens = new TokenService(fastify.db, fastify.redis);
  const reset = new PasswordResetService(fastify.db, fastify.redis);
  const requireAuth = authenticate(tokens);

  const resolveTenantId = async (slug: string): Promise<number> => {
    const tenant = await fastify.db('tenants').where({ slug, is_active: 1 }).first();
    if (!tenant) throw new UnauthorizedError('Tenant not found or inactive');
    return tenant.id;
  };

  fastify.post('/auth/register', async (req, reply) => {
    if (!env.ALLOW_REGISTRATION) {
      throw new ForbiddenError('Registration is disabled');
    }
    const body = RegisterSchema.parse(req.body);
    const tenantId = await resolveTenantId(body.tenantSlug);
    const result = await auth.register(
      {
        tenantId,
        username: body.username,
        email: body.email,
        password: body.password,
        displayName: body.displayName,
      },
      ctxFrom(req),
    );
    return reply.status(201).send(result);
  });

  fastify.post('/auth/login', async (req) => {
    const body = LoginSchema.parse(req.body);
    const tenantId = await resolveTenantId(body.tenantSlug);
    return auth.login(
      { tenantId, identifier: body.identifier, password: body.password },
      ctxFrom(req),
    );
  });

  fastify.post('/auth/widget-token', async (req) => {
    const { widgetToken } = WidgetTokenSchema.parse(req.body);
    return auth.widgetLogin(widgetToken, ctxFrom(req));
  });

  fastify.post('/auth/refresh', async (req) => {
    const { refreshToken } = RefreshSchema.parse(req.body);
    return auth.refresh(refreshToken, ctxFrom(req));
  });

  fastify.post('/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    const body = LogoutSchema.safeParse(req.body ?? {});
    const authCtx = req.auth!;
    let ttlSeconds = env.JWT_ACCESS_TTL;
    try {
      const [, payload] = authCtx.raw.split('.');
      const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
      if (decoded.exp) ttlSeconds = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
    } catch {
      /* fall back */
    }
    await auth.logout({
      refreshToken: body.success ? body.data.refreshToken : undefined,
      accessJti: authCtx.jti,
      accessTtlSeconds: ttlSeconds,
    });
    return reply.status(204).send();
  });

   fastify.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    const { userId, tenantId, role } = req.auth!;
    const row = await fastify.db('users')
      .where({ tenant_id: tenantId, id: userId })
      .first();
    if (!row) throw new UnauthorizedError('User not found');
    return {
      id: row.id,
      tenantId: row.tenant_id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      role,
    };
  });

  // ---- Password reset ----

  fastify.post('/auth/password-reset/request', async (req) => {
    const body = PasswordResetRequestSchema.parse(req.body);
    const tenantId = await resolveTenantId(body.tenantSlug);
    return reset.request({
      tenantId,
      identifier: body.identifier,
      ip: req.ip,
    });
  });

  fastify.post('/auth/password-reset/confirm', async (req) => {
    const body = PasswordResetConfirmSchema.parse(req.body);
    return reset.confirm({ token: body.token, newPassword: body.newPassword });
  });

  fastify.get('/auth/password-reset/validate', async (req) => {
    const { token } = PasswordResetValidateSchema.parse(req.query);
    return reset.validateToken(token);
  });
};

export default authRoutes;

void ConflictError;
