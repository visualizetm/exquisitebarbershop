import { z } from 'zod';
import { idSchema } from './common';

export const sessionDocumentSchema = z.object({
  _id: idSchema,
  /** SHA-256 of the opaque cookie token. The raw token is never stored. */
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  userId: idSchema,
  createdAt: z.date(),
  /** TTL index removes the document after this instant. */
  expiresAt: z.date(),
  lastSeenAt: z.date(),
  ip: z.string().max(64).nullable(),
  userAgent: z.string().max(512).nullable(),
  revokedAt: z.date().nullable(),
});
export type SessionDocument = z.infer<typeof sessionDocumentSchema>;
