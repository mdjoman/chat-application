import { z } from 'zod';

export const IdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const MemberIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export const CreateConversationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('direct'),
    peerId: z.coerce.number().int().positive(),
  }),
  z.object({
    type: z.literal('group'),
    name: z.string().min(1).max(190),
    memberIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
    avatarUrl: z.string().url().max(512).nullable().optional(),
  }),
]);

export const UpdateConversationSchema = z.object({
  name: z.string().min(1).max(190).nullable().optional(),
  avatarUrl: z.string().url().max(512).nullable().optional(),
});

export const AddMembersSchema = z.object({
  memberIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
});

export const PromoteSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;
export type UpdateConversationInput = z.infer<typeof UpdateConversationSchema>;
