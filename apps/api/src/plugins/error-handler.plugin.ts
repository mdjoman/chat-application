import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { isProduction } from '../config/env.js';

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    // Zod
    if (error instanceof ZodError) {
      request.log.warn({ issues: error.issues }, 'validation error');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
      });
    }

    if (error instanceof AppError) {
      if (!error.isOperational) {
        request.log.error({ err: error }, 'non-operational error');
      } else {
        request.log.warn(
          { code: error.code, statusCode: error.statusCode, details: error.details },
          error.message,
        );
      }
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }

    // Fastify built-ins (validation, etc.)
    if ('statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
      request.log.warn({ err: error }, 'client error');
      return reply.status(error.statusCode).send({
        error: { code: 'CLIENT_ERROR', message: error.message },
      });
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'Internal server error' : error.message,
      },
    });
  });

  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` },
    });
  });
};

export default fp(plugin, { name: 'error-handler' });
