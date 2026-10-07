import type {
  FastifyPluginAsync,
} from 'fastify';

import crypto from 'node:crypto';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  TokenService,
} from '../auth/token.service.js';

import {
  env,
} from '../../config/env.js';

/**
 * ============================================================
 * TURN CREDENTIAL RESPONSE
 * ============================================================
 */

interface TurnCredentialsResponse {
  username: string;

  credential: string;

  ttl: number;

  expiresAt: number;

  stunUrl: string;

  turnUrl: string;

  iceServers: Array<{
    urls:
      | string
      | string[];

    username?: string;

    credential?: string;
  }>;

  iceCandidatePoolSize: number;
}

/**
 * ============================================================
 * GENERATE TURN CREDENTIAL
 * ============================================================
 *
 * TURN REST API style authentication:
 *
 * username:
 *
 *   <expiry-unix-timestamp>:<user-id>
 *
 * credential:
 *
 *   Base64(
 *     HMAC-SHA1(
 *       TURN_SECRET,
 *       username
 *     )
 *   )
 *
 * Example:
 *
 * username:
 *
 * 1791367200:45
 *
 * credential:
 *
 * aTemporaryGeneratedPassword==
 *
 * The TURN server must use the SAME TURN_SECRET.
 */

function generateTurnCredential(
  userId: number,
): {
  username: string;

  credential: string;

  expiresAt: number;
} {
  /**
   * Current UNIX timestamp.
   */

  const now =
    Math.floor(
      Date.now() /
        1000,
    );

  /**
   * Credential expiry.
   */

  const expiresAt =
    now +
    env.TURN_TTL;

  /**
   * Include authenticated user ID.
   *
   * This helps identify which application user received the
   * temporary TURN credential.
   */

  const username =
    `${expiresAt}:${userId}`;

  /**
   * Coturn TURN REST API style credential.
   */

  const credential =
    crypto
      .createHmac(
        'sha1',
        env.TURN_SECRET,
      )
      .update(
        username,
      )
      .digest(
        'base64',
      );

  return {
    username,
    credential,
    expiresAt,
  };
}

/**
 * ============================================================
 * TURN ROUTES
 * ============================================================
 */

const turnRoutes: FastifyPluginAsync =
  async (fastify) => {
    /**
     * ========================================================
     * DEPENDENCIES
     * ========================================================
     */

    const tokens =
      new TokenService(
        fastify.db,
        fastify.redis,
      );

    const auth =
      authenticate(tokens);

    /**
     * ========================================================
     * GET TURN / WEBRTC CREDENTIALS
     * ========================================================
     *
     * GET /turn/credentials
     *
     * Final mounted endpoint:
     *
     * GET /api/v1/turn/credentials
     *
     * Authentication:
     *
     * Authorization:
     * Bearer <access-token>
     */

    fastify.get(
      '/turn/credentials',
      {
        preHandler:
          auth,
      },
      async (
        req,
        reply,
      ) => {
        const {
          userId,
          tenantId,
        } = req.auth!;

        /**
         * Generate temporary credential for this user.
         */

        const {
          username,
          credential,
          expiresAt,
        } =
          generateTurnCredential(
            userId,
          );

        /**
         * ====================================================
         * ICE SERVER CONFIGURATION
         * ====================================================
         *
         * This response can be passed directly into:
         *
         * new RTCPeerConnection({
         *   iceServers: response.iceServers,
         *   iceCandidatePoolSize:
         *     response.iceCandidatePoolSize
         * });
         */

        const response:
          TurnCredentialsResponse =
          {
            username,

            credential,

            ttl:
              env.TURN_TTL,

            expiresAt,

            stunUrl:
              env.STUN_URL,

            turnUrl:
              env.TURN_URL,

            iceServers: [
              /**
               * STUN
               */

              {
                urls:
                  env.STUN_URL,
              },

              /**
               * TURN
               */

              {
                urls:
                  env.TURN_URL,

                username,

                credential,
              },
            ],

            /**
             * Pre-gather some ICE candidates.
             *
             * This can reduce perceived call setup latency.
             */

            iceCandidatePoolSize:
              10,
          };

        /**
         * TURN credentials are temporary secrets.
         *
         * Never allow browsers/proxies/CDNs to cache this
         * response.
         */

        reply
          .header(
            'Cache-Control',
            'no-store, no-cache, must-revalidate, private',
          )
          .header(
            'Pragma',
            'no-cache',
          )
          .header(
            'Expires',
            '0',
          );

        fastify.log.debug(
          {
            userId,

            tenantId,

            expiresAt,

            ttl:
              env.TURN_TTL,
          },
          'Temporary TURN credentials issued',
        );

        return reply.send(
          response,
        );
      },
    );
  };

export default turnRoutes;
