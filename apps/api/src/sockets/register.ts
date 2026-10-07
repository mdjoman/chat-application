import type { Socket } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import type { SocketContext } from './context.js';
import { registerMessageHandlers } from './chat/messages.js';
import { registerTypingHandlers } from './chat/typing.js';

export async function registerHandlers(app: FastifyInstance, socket: Socket): Promise<void> {
  const ctx = socket.data.ctx as SocketContext;
  await registerMessageHandlers(app, socket, ctx);
  await registerTypingHandlers(app, socket, ctx);
}
