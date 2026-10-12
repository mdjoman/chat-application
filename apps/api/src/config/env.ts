import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default(''),

  MYSQL_HOST: z.string(),
  MYSQL_PORT: z.coerce.number().int().positive(),
  MYSQL_USER: z.string(),
  MYSQL_PASSWORD: z.string(),
  MYSQL_DATABASE: z.string(),
  MYSQL_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  MYSQL_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number().int().positive(),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  REDIS_KEY_PREFIX: z.string().default('chat:'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),

  WIDGET_SHARED_SECRET: z.string().min(32),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  ALLOW_REGISTRATION: z.string().default('true').transform((v) => v === 'true'),

  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),

  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8).optional(),

  // Uploads
  UPLOAD_DIR: z.string().default('./storage/uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(26_214_400),
  UPLOAD_ALLOWED_MIME: z.string().default(
    'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/webm,audio/wav,application/pdf,text/plain,application/zip',
  ),

  // TURN
  TURN_URL: z.string().default('turn:localhost:3478'),
  TURN_SECRET: z.string().min(16).default('change-me-turn-secret'),
  TURN_TTL: z.coerce.number().int().positive().default(3600),
  STUN_URL: z.string().default('stun:stun.l.google.com:19302'),

  // Password reset
  PASSWORD_RESET_TTL: z.coerce.number().int().positive().default(1800),
  PASSWORD_RESET_URL: z.string().url().default('http://localhost:5173/reset-password'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const allowedMimeTypes = env.UPLOAD_ALLOWED_MIME.split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
