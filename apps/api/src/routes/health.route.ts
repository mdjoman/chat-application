import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'chat-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  fastify.get('/health/ready', async (_req, reply) => {
    const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

    // MySQL
    {
      const start = Date.now();
      try {
        await fastify.db.raw('SELECT 1');
        checks.mysql = { ok: true, latencyMs: Date.now() - start };
      } catch (err) {
        checks.mysql = { ok: false, error: (err as Error).message };
      }
    }

    // Redis
    {
      const start = Date.now();
      try {
        await fastify.redis.ping();
        checks.redis = { ok: true, latencyMs: Date.now() - start };
      } catch (err) {
        checks.redis = { ok: false, error: (err as Error).message };
      }
    }

    const ready = Object.values(checks).every((c) => c.ok);
    return reply.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
};

export default healthRoutes;
