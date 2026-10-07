import { buildApp } from './app.js';
import { env } from './config/env.js';
import { registerGracefulShutdown } from './utils/shutdown.js';

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      { port: env.PORT, host: env.HOST, env: env.NODE_ENV },
      'chat-api listening',
    );
  } catch (err) {
    app.log.fatal({ err }, 'failed to start');
    process.exit(1);
  }

  registerGracefulShutdown(app);
}

void main();
