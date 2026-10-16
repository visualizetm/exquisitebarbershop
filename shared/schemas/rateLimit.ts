import { z } from 'zod';
import { idSchema } from './common';

/** Fixed-window counter. One document per (key, windowStart). */
export const rateLimitDocumentSchema = z.object({
  _id: idSchema,
  /** For example "login:ip:203.0.113.4" or "booking:phone:+12125551234". */
  key: z.string().min(1).max(160),
  windowStart: z.date(),
  count: z.int().min(0),
  /** TTL index removes the window after it ends. */
  expiresAt: z.date(),
});
export type RateLimitDocument = z.infer<typeof rateLimitDocumentSchema>;
