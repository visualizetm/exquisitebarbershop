import { z } from 'zod';
import { idSchema } from '../schemas/common';

/**
 * The front desk check-in screen. A customer types their name or the last 4 of their phone and
 * taps their appointment. Every view here is masked: first name and last initial, the time and
 * the barber, never a phone or an email, because the screen faces the room.
 */
export const checkInLookupQuerySchema = z.object({
  q: z.string().trim().min(1).max(60),
});

export const checkInMatchSchema = z.object({
  id: idSchema,
  startAt: z.iso.datetime(),
  /** "Chris M." */
  name: z.string(),
  staffName: z.string(),
  chairNumber: z.int().nullable(),
  arrived: z.boolean(),
});
export type CheckInMatch = z.infer<typeof checkInMatchSchema>;

export const checkInLookupResponseSchema = z.object({
  matches: z.array(checkInMatchSchema),
});

export const checkInArrivedResponseSchema = z.object({ match: checkInMatchSchema });
