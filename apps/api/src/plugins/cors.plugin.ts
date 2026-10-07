import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyPluginAsync } from 'fastify';

import { env, corsOrigins } from '../config/env.js';
import { TenantOriginsRepository } from '../modules/tenants/origins.repository.js';

const CACHE_KEY = 'cors:origins:active';
const CACHE_TTL = 60; // seconds

const plugin: FastifyPluginAsync = async (fastify) => {
  const repo = new TenantOriginsRepository(fastify.db);

  async function loadAllowedOrigins(): Promise<Set<string>> {
    // 1. Try Redis cache
    try {
      const cached = await fastify.redis.get(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as string[];
        return new Set(parsed);
      }
    } catch {
      /* fall through */
    }

    // 2. Load from DB
    const set = await repo.listActiveOrigins();

    // 3. Cache
    try {
      await fastify.redis.set(CACHE_KEY, JSON.stringify([...set]), 'EX', CACHE_TTL);
    } catch {
      /* non-fatal */
    }

    return set;
  }

  await fastify.register(cors, {
    origin(origin, cb) {
      // Allow server-to-server / same-origin requests (no Origin header).
      if (!origin) return cb(null, true);

      // Static allowlist from .env (dev convenience + fallback).
      if (corsOrigins.includes(origin)) return cb(null, true);

      // Dynamic tenant-scoped allowlist from DB.
      loadAllowedOrigins()
        .then((set) => {
          if (set.has(origin)) return cb(null, true);
          fastify.log.warn({ origin }, 'CORS: origin not allowed');
          return cb(null, false);
        })
        .catch((err) => {
          fastify.log.error({ err }, 'CORS: failed to load origins');
          return cb(null, false);
        });
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Device-Id',
      'X-Request-Id',
      'X-Widget-App-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  });
};

export default fp(plugin, { name: 'cors' });
