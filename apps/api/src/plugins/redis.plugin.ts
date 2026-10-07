import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type Redis from 'ioredis';
import { createRedis } from '../db/redis.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  const redis = createRedis();

  try {
    await redis.ping();
    fastify.log.info('redis connection ok');
  } catch (err) {
    fastify.log.error({ err }, 'redis connection failed');
    throw err;
  }

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
    fastify.log.info('redis connection closed');
  });
};

export default fp(plugin, { name: 'redis' });
