import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';

import { env } from '../../config/env.js';
import { authenticate } from '../../middleware/authenticate.js';
import { TokenService } from '../auth/token.service.js';

const turnRoutes: FastifyPluginAsync = async (fastify) => {
  const tokens = new TokenService(fastify.db, fastify.redis);
  const auth = authenticate(tokens);

  fastify.get('/turn/credentials', { preHandler: auth }, async (req) => {
    const { userId } = req.auth!;
    const ttl = env.TURN_TTL;
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${userId}`;
    const hmac = crypto.createHmac('sha1', env.TURN_SECRET);
    hmac.update(username);
    const password = hmac.digest('base64');
    return {
      urls: [env.STUN_URL, env.TURN_URL],
      username,
      credential: password,
      ttl,
    };
  });
};

export default turnRoutes;
