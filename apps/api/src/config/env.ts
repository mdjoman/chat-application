import 'dotenv/config';

import { z } from 'zod';

/**
 * ============================================================
 * ENVIRONMENT SCHEMA
 * ============================================================
 */

const EnvSchema = z.object({
  /**
   * ==========================================================
   * APPLICATION
   * ==========================================================
   */

  NODE_ENV: z
    .enum([
      'development',
      'test',
      'production',
    ])
    .default(
      'development',
    ),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(3000),

  HOST: z
    .string()
    .default(
      '0.0.0.0',
    ),

  LOG_LEVEL: z
    .enum([
      'fatal',
      'error',
      'warn',
      'info',
      'debug',
      'trace',
    ])
    .default(
      'info',
    ),

  API_BASE_URL: z
    .string()
    .url()
    .default(
      'http://localhost:3000',
    ),

  PUBLIC_API_BASE_URL: z
    .string()
    .url()
    .default(
      'http://localhost:3000',
    ),

  CORS_ORIGINS: z
    .string()
    .default(''),

  /**
   * ==========================================================
   * MYSQL
   * ==========================================================
   */

  MYSQL_HOST:
    z.string(),

  MYSQL_PORT: z.coerce
    .number()
    .int()
    .positive(),

  MYSQL_USER:
    z.string(),

  MYSQL_PASSWORD:
    z.string(),

  MYSQL_DATABASE:
    z.string(),

  MYSQL_POOL_MIN: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(2),

  MYSQL_POOL_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(10),

  /**
   * ==========================================================
   * REDIS
   * ==========================================================
   */

  REDIS_HOST:
    z.string(),

  REDIS_PORT: z.coerce
    .number()
    .int()
    .positive(),

  REDIS_PASSWORD: z
    .string()
    .optional()
    .default(''),

  REDIS_DB: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(0),

  REDIS_KEY_PREFIX: z
    .string()
    .default(
      'chat:',
    ),

  /**
   * ==========================================================
   * JWT
   * ==========================================================
   */

  JWT_ACCESS_SECRET: z
    .string()
    .min(32),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32),

  JWT_ACCESS_TTL: z.coerce
    .number()
    .int()
    .positive()
    .default(900),

  JWT_REFRESH_TTL: z.coerce
    .number()
    .int()
    .positive()
    .default(
      2_592_000,
    ),

  /**
   * ==========================================================
   * WIDGET SECURITY
   * ==========================================================
   */

  WIDGET_SHARED_SECRET: z
    .string()
    .min(32),

  /**
   * ==========================================================
   * RATE LIMIT
   * ==========================================================
   */

  RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(100),

  RATE_LIMIT_WINDOW_MS:
    z.coerce
      .number()
      .int()
      .positive()
      .default(
        60_000,
      ),

  /**
   * ==========================================================
   * REGISTRATION
   * ==========================================================
   */

  ALLOW_REGISTRATION: z
    .string()
    .default('true')
    .transform(
      (value) =>
        value === 'true',
    ),

  /**
   * ==========================================================
   * PASSWORD HASHING
   * ==========================================================
   */

  ARGON2_MEMORY_COST:
    z.coerce
      .number()
      .int()
      .positive()
      .default(
        65_536,
      ),

  ARGON2_TIME_COST:
    z.coerce
      .number()
      .int()
      .positive()
      .default(3),

  ARGON2_PARALLELISM:
    z.coerce
      .number()
      .int()
      .positive()
      .default(1),

  /**
   * ==========================================================
   * BOOTSTRAP ADMIN
   * ==========================================================
   */

  BOOTSTRAP_ADMIN_EMAIL:
    z
      .string()
      .email()
      .optional(),

  BOOTSTRAP_ADMIN_PASSWORD:
    z
      .string()
      .min(8)
      .optional(),

  /**
   * ==========================================================
   * ATTACHMENTS / UPLOADS
   * ==========================================================
   */

  UPLOAD_DIR: z
    .string()
    .default(
      './storage/uploads',
    ),

  UPLOAD_MAX_BYTES:
    z.coerce
      .number()
      .int()
      .positive()
      .default(
        26_214_400,
      ),

  /**
   * Supported:
   *
   * Images
   * -------
   * JPEG
   * PNG
   * GIF
   * WEBP
   *
   * Video
   * -----
   * MP4
   * WEBM
   *
   * Audio / Voice
   * -------------
   * MP3
   * OGG
   * WEBM
   * WAV
   *
   * Documents
   * ---------
   * PDF
   * TXT
   * ZIP
   *
   * audio/webm is especially important because browser
   * MediaRecorder commonly generates WebM/Opus voice notes.
   */

  UPLOAD_ALLOWED_MIME: z
    .string()
    .default(
      [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',

        'video/mp4',
        'video/webm',

        'audio/mpeg',
        'audio/ogg',
        'audio/webm',
        'audio/wav',

        'application/pdf',
        'text/plain',
        'application/zip',
      ].join(','),
    ),

  /**
   * ==========================================================
   * WEBRTC — STUN / TURN
   * ==========================================================
   *
   * Existing project architecture uses short-lived TURN
   * credentials.
   *
   * Browser:
   *
   * GET /api/v1/turn/credentials
   *
   * Backend generates:
   *
   * username =
   *   <expiry timestamp>:<user id>
   *
   * credential =
   *   HMAC-SHA1(username, TURN_SECRET)
   *
   * This matches TURN REST API style authentication used by
   * TURN servers such as coturn.
   *
   * IMPORTANT:
   *
   * TURN_SECRET must be the same secret configured in the TURN
   * server.
   */

  STUN_URL: z
    .string()
    .trim()
    .min(1)
    .default(
      'stun:stun.l.google.com:19302',
    )
    .refine(
      (value) =>
        value.startsWith(
          'stun:',
        ) ||
        value.startsWith(
          'stuns:',
        ),
      {
        message:
          'STUN_URL must start with stun: or stuns:',
      },
    ),

  TURN_URL: z
    .string()
    .trim()
    .min(1)
    .default(
      'turn:localhost:3478',
    )
    .refine(
      (value) =>
        value.startsWith(
          'turn:',
        ) ||
        value.startsWith(
          'turns:',
        ),
      {
        message:
          'TURN_URL must start with turn: or turns:',
      },
    ),

  /**
   * Production must use a strong random secret.
   *
   * We retain the development default so the existing local
   * project does not suddenly stop starting.
   *
   * Production validation below rejects this default.
   */

  TURN_SECRET: z
    .string()
    .min(16)
    .default(
      'change-me-turn-secret',
    ),

  /**
   * Temporary TURN credential lifetime.
   *
   * Default:
   *
   * 3600 seconds = 1 hour
   */

  TURN_TTL: z.coerce
    .number()
    .int()
    .positive()
    .max(
      86_400,
      'TURN_TTL cannot exceed 24 hours.',
    )
    .default(3600),
});

/**
 * ============================================================
 * PARSE ENVIRONMENT
 * ============================================================
 */

const parsed =
  EnvSchema.safeParse(
    process.env,
  );

if (!parsed.success) {
  console.error(
    '❌ Invalid environment configuration:',
  );

  console.error(
    parsed.error
      .flatten()
      .fieldErrors,
  );

  process.exit(1);
}

export const env =
  parsed.data;

/**
 * ============================================================
 * PRODUCTION SECURITY VALIDATION
 * ============================================================
 */

if (
  env.NODE_ENV ===
    'production' &&
  env.TURN_SECRET ===
    'change-me-turn-secret'
) {
  console.error(
    '❌ TURN_SECRET must be changed before running in production.',
  );

  process.exit(1);
}

/**
 * ============================================================
 * CORS ORIGINS
 * ============================================================
 */

export const corsOrigins =
  env.CORS_ORIGINS
    .split(',')
    .map(
      (value) =>
        value.trim(),
    )
    .filter(Boolean);

/**
 * ============================================================
 * ALLOWED ATTACHMENT MIME TYPES
 * ============================================================
 */

export const allowedMimeTypes =
  Array.from(
    new Set(
      env.UPLOAD_ALLOWED_MIME
        .split(',')
        .map(
          (value) =>
            value
              .trim()
              .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );

/**
 * ============================================================
 * ENVIRONMENT HELPERS
 * ============================================================
 */

export const isProduction =
  env.NODE_ENV ===
  'production';

export const isDevelopment =
  env.NODE_ENV ===
  'development';

export const isTest =
  env.NODE_ENV ===
  'test';

/**
 * ============================================================
 * WEBRTC HELPERS
 * ============================================================
 */

export const webRtcEnvironment = {
  stunUrl:
    env.STUN_URL,

  turnUrl:
    env.TURN_URL,

  turnCredentialTtl:
    env.TURN_TTL,
} as const;
