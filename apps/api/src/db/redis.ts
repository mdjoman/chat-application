import Redis, { type RedisOptions } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export function createRedis(): Redis {
  const options: RedisOptions = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    keyPrefix: env.REDIS_KEY_PREFIX,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      logger.warn({ attempt: times, delay }, 'redis reconnect');
      return delay;
    },
  };

  if (env.REDIS_PASSWORD) options.password = env.REDIS_PASSWORD;

  const client = new Redis(options);

  client.on('connect', () => logger.info('redis connecting'));
  client.on('ready', () => logger.info('redis ready'));
  client.on('error', (err) => logger.error({ err }, 'redis error'));
  client.on('close', () => logger.warn('redis closed'));

  return client;
}
