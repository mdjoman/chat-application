import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';

const plugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, {
    limits: {
      fileSize: env.UPLOAD_MAX_BYTES,
      files: 5,
      fields: 20,
    },
    attachFieldsToBody: false,
  });
};

export default fp(plugin, { name: 'upload' });
