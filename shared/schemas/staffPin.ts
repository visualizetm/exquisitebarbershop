import { z } from 'zod';
import { idSchema, timestampsSchema } from './common';

/** A barber's PIN. One per staff member; deleting it is how "reset" works. */
export const staffPinDocumentSchema = z
  .object({
    _id: idSchema,
    staffId: idSchema,
    /** argon2id PHC string of a keyed digest of the PIN. Never returned by the API. */
    pinHash: z.string().min(1),
    pinSetAt: z.date(),
    lastSignInAt: z.date().nullable(),
  })
  .extend(timestampsSchema.shape);
export type StaffPinDocument = z.infer<typeof staffPinDocumentSchema>;

/** A one-time link that lets a barber choose a PIN. Only the hash of the token is stored. */
export const setupTokenDocumentSchema = z.object({
  _id: idSchema,
  staffId: idSchema,
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** The owner who made the link. */
  createdByUserId: idSchema,
  createdAt: z.date(),
  /** TTL index removes the document after this instant. */
  expiresAt: z.date(),
  usedAt: z.date().nullable(),
});
export type SetupTokenDocument = z.infer<typeof setupTokenDocumentSchema>;

/** A barber's signed-in phone or tablet. Absolute 12 hour limit, no sliding. */
export const teamSessionDocumentSchema = z.object({
  _id: idSchema,
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  staffId: idSchema,
  createdAt: z.date(),
  expiresAt: z.date(),
  ip: z.string().max(64).nullable(),
  userAgent: z.string().max(512).nullable(),
  revokedAt: z.date().nullable(),
});
export type TeamSessionDocument = z.infer<typeof teamSessionDocumentSchema>;
