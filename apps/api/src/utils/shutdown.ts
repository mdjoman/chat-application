import type { FastifyInstance } from 'fastify';

export function registerGracefulShutdown(app: FastifyInstance): void {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;

    app.log.info({ signal }, 'shutdown initiated');

    const timer = setTimeout(() => {
      app.log.error('forced exit after timeout');
      process.exit(1);
    }, 15_000);
    timer.unref();

    try {
      await app.close();
      app.log.info('shutdown complete');
      clearTimeout(timer);
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'shutdown error');
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    app.log.fatal({ err }, 'uncaughtException');
    process.exit(1);
  });
}
