import { z } from 'zod';

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const ConversationIdParamSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
});

export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const SendMessageSchema = z.object({
  type: z.enum(['text', 'image', 'video', 'audio', 'file', 'voice', 'system']).default('text'),
  content: z.string().max(8000).optional().nullable(),
  replyToId: z.coerce.number().int().positive().nullable().optional(),
  clientId: z.string().max(64).optional(),
  attachmentIds: z.array(z.coerce.number().int().positive()).max(5).optional(),
});

export const EditMessageSchema = z.object({
  content: z.string().min(1).max(8000),
});

export const ReactionSchema = z.object({
  reaction: z.string().min(1).max(16),
});

export const ReadSchema = z.object({
  messageIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
});
export const PinSchema = z.object({
  pinned: z.boolean(),
});

export const ForwardSchema = z.object({
  targetConversationIds: z
    .array(z.coerce.number().int().positive())
    .min(1)
    .max(10),
});
