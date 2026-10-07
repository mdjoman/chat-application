import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { Knex } from 'knex';
import { createKnex } from '../db/knex.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Knex;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  const db = createKnex();

  // Verify connection at boot
  try {
    await db.raw('SELECT 1');
    fastify.log.info('mysql connection ok');
  } catch (err) {
    fastify.log.error({ err }, 'mysql connection failed');
    throw err;
  }

  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await db.destroy();
    fastify.log.info('mysql pool closed');
  });
};

export default fp(plugin, { name: 'db' });
