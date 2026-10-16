import { z } from 'zod';
import { idSchema, isoDateSchema } from '../schemas/common';

/** "any" means first available. */
export const staffSelectorSchema = z.union([z.literal('any'), idSchema]);
export type StaffSelector = z.infer<typeof staffSelectorSchema>;

export const availabilityQuerySchema = z.object({
  date: isoDateSchema,
  /** Comma separated service ids in the order they will be performed. */
  serviceIds: z
    .string()
    .transform((v) => v.split(',').filter(Boolean))
    .pipe(z.array(idSchema).min(1).max(6)),
  staff: staffSelectorSchema.default('any'),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const availabilitySlotSchema = z.object({
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  /** Chair that would take the booking. For "any" this is the fairness pick for that slot. */
  staffId: idSchema,
});
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;

export const availabilityResponseSchema = z.object({
  date: isoDateSchema,
  durationMinutes: z.int(),
  slots: z.array(availabilitySlotSchema),
  /** Why a day has no slots, when known. */
  closedReason: z.string().nullable(),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

export const availabilityDaysQuerySchema = z.object({
  /** YYYY-MM */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  serviceIds: availabilityQuerySchema.shape.serviceIds,
  staff: staffSelectorSchema.default('any'),
});

export const availabilityDaysResponseSchema = z.object({
  month: z.string(),
  /** ISO dates in the month that have at least one bookable slot. */
  availableDates: z.array(isoDateSchema),
});
export type AvailabilityDaysResponse = z.infer<typeof availabilityDaysResponseSchema>;
