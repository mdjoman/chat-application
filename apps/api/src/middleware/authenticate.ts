import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../utils/errors.js';
import type { TokenService } from '../modules/auth/token.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      userId: number;
      tenantId: number;
      role: string;
      jti: string;
      raw: string;
    };
  }
}

export function authenticate(tokens: TokenService) {
  return async function authenticateHook(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }
    const raw = header.slice('Bearer '.length).trim();
    const claims = await tokens.verifyAccessToken(raw);
    request.auth = {
      userId: Number(claims.sub),
      tenantId: Number(claims.tenantId),
      role: String(claims.role),
      jti: String(claims.jti),
      raw,
    };
  };
}
