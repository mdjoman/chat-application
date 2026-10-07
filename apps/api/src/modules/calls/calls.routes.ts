import type {
  FastifyPluginAsync,
} from 'fastify';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  TokenService,
} from '../auth/token.service.js';

import {
  getWebRtcConfig,
  hasTurnServer,
} from '../../config/webrtc.js';

/**
 * ============================================================
 * CALL ROUTES
 * ============================================================
 *
 * Purpose:
 *
 * Frontend
 *    ↓
 * GET /calls/config
 *    ↓
 * authenticated request
 *    ↓
 * WebRTC ICE configuration
 *    ↓
 * RTCPeerConnection({
 *   iceServers
 * })
 *
 * IMPORTANT:
 *
 * Actual call signaling is handled by Socket.IO:
 *
 * call:start
 * call:offer
 * call:answer
 * call:ice
 * call:reject
 * call:busy
 * call:end
 *
 * Actual audio/video travels through WebRTC.
 */

const callsRoutes: FastifyPluginAsync =
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
     * GET WEBRTC CONFIG
     * ========================================================
     *
     * GET /calls/config
     *
     * Response:
     *
     * {
     *   "iceServers": [
     *     {
     *       "urls": "stun:stun.l.google.com:19302"
     *     },
     *     {
     *       "urls": [
     *         "turn:turn.example.com:3478?transport=udp",
     *         "turn:turn.example.com:3478?transport=tcp"
     *       ],
     *       "username": "...",
     *       "credential": "..."
     *     }
     *   ],
     *   "iceCandidatePoolSize": 10
     * }
     */

    fastify.get(
      '/calls/config',
      {
        preHandler:
          auth,
      },
      async (
        req,
        reply,
      ) => {
        /**
         * req.auth is intentionally accessed here.
         *
         * It confirms this endpoint is only being used from an
         * authenticated application session.
         */

        const {
          userId,
          tenantId,
        } = req.auth!;

        fastify.log.debug(
          {
            userId,
            tenantId,
          },
          'WebRTC configuration requested',
        );

        const config =
          getWebRtcConfig();

        return reply.send({
          iceServers:
            config.iceServers,

          iceCandidatePoolSize:
            config.iceCandidatePoolSize,
        });
      },
    );

    /**
     * ========================================================
     * CALL CAPABILITIES
     * ========================================================
     *
     * GET /calls/capabilities
     *
     * Frontend can use this endpoint to determine which call
     * features are currently supported by this backend.
     *
     * This is useful because we are intentionally implementing
     * 1-to-1 calls first.
     */

    fastify.get(
      '/calls/capabilities',
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

        fastify.log.debug(
          {
            userId,
            tenantId,
          },
          'Call capabilities requested',
        );

        return reply.send({
          enabled:
            true,

          audio:
            true,

          video:
            true,

          direct:
            true,

          group:
            false,

          screenShare:
            false,

          signaling:
            'socket.io',

          transport:
            'webrtc',

          turnConfigured:
            hasTurnServer(),
        });
      },
    );
  };

export default callsRoutes;
