import { z } from 'zod';

export const UpdateMeSchema = z.object({
  displayName: z.string().min(1).max(128).optional(),
  avatarUrl: z.string().url().max(512).nullable().optional(),
  statusText: z.string().max(190).nullable().optional(),
});

export const UpdateSettingsSchema = z.object({
  privacy_last_seen: z.enum(['everyone', 'contacts', 'nobody']).optional(),
  privacy_online: z.enum(['everyone', 'contacts', 'nobody']).optional(),
  privacy_calls: z.enum(['everyone', 'contacts', 'nobody']).optional(),
  privacy_groups: z.enum(['everyone', 'contacts', 'nobody']).optional(),
  privacy_messages: z.enum(['everyone', 'contacts', 'nobody']).optional(),
  notification_prefs: z.record(z.unknown()).nullable().optional(),
});

export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const IdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
export type SearchQueryInput = z.infer<typeof SearchQuerySchema>;
