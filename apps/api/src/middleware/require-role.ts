import type { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError } from '../utils/errors.js';

export function requireRole(allowed: string[]) {
  return async function requireRoleHook(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const role = request.auth?.role;
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenError('Insufficient role');
    }
  };
}
