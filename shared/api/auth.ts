import { z } from 'zod';
import { emailSchema } from '../schemas/common';
import { publicUserSchema } from '../schemas/user';
import { publicStaffSchema } from './public';

export const loginRequestSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

/** The signed-in login as the dashboard sees it. Dates are ISO strings. */
export const meUserSchema = publicUserSchema
  .omit({ lastLoginAt: true })
  .extend({ lastLoginAt: z.iso.datetime().nullable() });
export type MeUser = z.infer<typeof meUserSchema>;

export const meResponseSchema = z.object({
  user: meUserSchema,
  staff: publicStaffSchema.nullable(),
  permissions: z.object({ barbersCanBlockTime: z.boolean() }),
  /** What this deployment can do at all, whatever the role: photos need storage, demo is the showcase mode. */
  features: z.object({ photos: z.boolean(), demo: z.boolean(), email: z.boolean() }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(1).max(256),
});
export type ChangePasswordRequest = z.input<typeof changePasswordRequestSchema>;

export const changeEmailRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newEmail: emailSchema,
});
export type ChangeEmailRequest = z.input<typeof changeEmailRequestSchema>;

export const okResponseSchema = z.object({ ok: z.literal(true) });
export const logoutAllResponseSchema = z.object({ ok: z.literal(true), sessionsEnded: z.int() });
