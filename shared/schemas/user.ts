import { z } from 'zod';
import { emailSchema, idSchema, timestampsSchema } from './common';

export const userRoleSchema = z.enum(['owner', 'barber']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userDocumentSchema = z
  .object({
    _id: idSchema,
    email: emailSchema,
    /** argon2id PHC string. Never returned by the API. */
    passwordHash: z.string().min(1),
    role: userRoleSchema,
    /** Barber logins point at their staff record so they only see their own schedule. */
    staffId: idSchema.nullable(),
    isActive: z.boolean(),
    failedLoginCount: z.int().min(0),
    lockedUntil: z.date().nullable(),
    lastLoginAt: z.date().nullable(),
    passwordChangedAt: z.date(),
  })
  .extend(timestampsSchema.shape);
export type UserDocument = z.infer<typeof userDocumentSchema>;

/** What the API may expose about a user. */
export const publicUserSchema = userDocumentSchema.pick({
  _id: true,
  email: true,
  role: true,
  staffId: true,
  isActive: true,
  lastLoginAt: true,
});
export type PublicUser = z.infer<typeof publicUserSchema>;
