import { z } from 'zod';

export const RegisterSchema = z.object({
  tenantSlug: z.string().min(1).max(64),
  username: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'username may only contain letters, digits, ., _, -'),
  email: z.string().email().max(190).optional(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(128).optional(),
});

export const LoginSchema = z.object({
  tenantSlug: z.string().min(1).max(64),
  identifier: z.string().min(1).max(190),
  password: z.string().min(1).max(128),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const WidgetTokenSchema = z.object({
  widgetToken: z.string().min(20),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

export const PasswordResetRequestSchema = z.object({
  tenantSlug: z.string().min(1).max(64),
  identifier: z.string().min(1).max(190),
});

export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8).max(128),
});

export const PasswordResetValidateSchema = z.object({
  token: z.string().min(20),
});
