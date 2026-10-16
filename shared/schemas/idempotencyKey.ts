import { z } from 'zod';
import { idSchema } from './common';

export const idempotencyStatusSchema = z.enum(['inProgress', 'completed']);

/** Stored result of a mutating request so a retried request returns the same answer. */
export const idempotencyKeyDocumentSchema = z.object({
  _id: idSchema,
  /** Route name, for example "bookings.create". Keys are unique within a scope. */
  scope: z.string().min(1).max(60),
  key: z.string().min(8).max(128),
  /** SHA-256 of the canonical request body; a reused key with a different body is rejected. */
  requestHash: z.string().regex(/^[0-9a-f]{64}$/),
  status: idempotencyStatusSchema,
  response: z.object({ status: z.int(), body: z.unknown() }).nullable(),
  createdAt: z.date(),
  /** TTL index removes the record after this instant (24 hours after creation). */
  expiresAt: z.date(),
});
export type IdempotencyKeyDocument = z.infer<typeof idempotencyKeyDocumentSchema>;
