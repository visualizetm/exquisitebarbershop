import { z } from 'zod';
import { bookingViewSchema } from '../../shared/api/bookings';

/**
 * What an outbox row stores. Self-contained so a message renders the same way
 * even if settings or the booking change later.
 */
export const shopSnapshotSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  addressLines: z.array(z.string()),
  phone: z.string(),
  email: z.string(),
  fromName: z.string(),
  replyToEmail: z.string().nullable(),
});
export type ShopSnapshot = z.infer<typeof shopSnapshotSchema>;

export const bookingEmailPayloadSchema = z.object({
  booking: bookingViewSchema,
  shop: shopSnapshotSchema,
  /** Customer messages only. */
  managePath: z.string().nullable(),
  /** For reschedules: the earlier start, already formatted for shop time. */
  previousStartAt: z.iso.datetime().nullable(),
  cancelReason: z.string().nullable(),
});
export type BookingEmailPayload = z.infer<typeof bookingEmailPayloadSchema>;
