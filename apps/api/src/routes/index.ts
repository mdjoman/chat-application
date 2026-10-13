import type { FastifyPluginAsync } from 'fastify';
import healthRoutes from './health.route.js';
import authRoutes from '../modules/auth/auth.routes.js';
import usersRoutes from '../modules/users/users.routes.js';
import conversationsRoutes from '../modules/conversations/conversations.routes.js';
import messagesRoutes from '../modules/messages/messages.routes.js';
import originsRoutes from '../modules/tenants/origins.routes.js';
import attachmentsRoutes from '../modules/attachments/attachments.routes.js';
import turnRoutes from '../modules/turn/turn.routes.js';
import callsRoutes from '../modules/calls/calls.routes.js';

const routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(usersRoutes);
  await fastify.register(conversationsRoutes);
  await fastify.register(messagesRoutes);
  await fastify.register(originsRoutes);
  await fastify.register(attachmentsRoutes);
  await fastify.register(turnRoutes);
  await fastify.register(callsRoutes);
};

export default routes;