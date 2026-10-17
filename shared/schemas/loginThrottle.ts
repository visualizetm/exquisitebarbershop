import { z } from 'zod';

/**
 * Failed sign-in tracking keyed by the SHA-256 of the normalized email, whether or
 * not an account exists. Because unknown emails are throttled exactly like real
 * ones, the lockout response never reveals which emails have accounts.
 */
export const loginThrottleDocumentSchema = z.object({
  /** sha256(lowercased email) */
  _id: z.string().regex(/^[0-9a-f]{64}$/),
  /** Consecutive failures since the last success or lockout. */
  failures: z.int().min(0),
  /** How many lockouts in a row; each one lasts longer. */
  lockoutLevel: z.int().min(0),
  lockedUntil: z.date().nullable(),
  updatedAt: z.date(),
  /** TTL: the record is forgotten a day after the last failure. */
  expiresAt: z.date(),
});
export type LoginThrottleDocument = z.infer<typeof loginThrottleDocumentSchema>;
