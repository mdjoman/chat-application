import { z } from 'zod';

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const InitiateCallSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  callType: z.enum(['audio', 'video']),
  deviceId: z.string().max(128).optional(),
});

export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

export const SignalAckSchema = z.object({
  ok: z.boolean().optional(),
  error: z.string().optional(),
});