import { z } from 'zod';
import { idSchema, isoDateSchema } from '../schemas/common';

/** "any" means first available; otherwise a staff slug (old aliases work) or a staff id. */
export const staffSelectorSchema = z.union([
  z.literal('any'),
  z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid staff selector'),
]);
export type StaffSelector = z.infer<typeof staffSelectorSchema>;

/** Why a day has nothing to offer. Machine readable so the UI can explain greyed days. */
export const noAvailabilityReasonSchema = z.enum([
  'closed',
  'dayOff',
  'fullyBooked',
  'outsideWindow',
  'noQualifiedStaff',
]);
export type NoAvailabilityReason = z.infer<typeof noAvailabilityReasonSchema>;

const serviceIdsParam = z
  .string()
  .transform((v) => v.split(',').filter(Boolean))
  .pipe(z.array(idSchema).min(1).max(6));

export const availabilityQuerySchema = z.object({
  date: isoDateSchema,
  /** Comma separated service ids in the order they will be performed. */
  serviceIds: serviceIdsParam,
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
  /** Services plus the effective buffer. */
  durationMinutes: z.int(),
  slots: z.array(availabilitySlotSchema),
  reason: noAvailabilityReasonSchema.nullable(),
  /** Human readable version of reason, when known. */
  closedReason: z.string().nullable(),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

export const availabilityDaysQuerySchema = z.object({
  serviceIds: serviceIdsParam,
  staff: staffSelectorSchema.default('any'),
  /** Optional sub-range; defaults to the whole booking window starting today. */
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type AvailabilityDaysQuery = z.infer<typeof availabilityDaysQuerySchema>;

export const availabilityDaySchema = z.object({
  date: isoDateSchema,
  available: z.boolean(),
  reason: noAvailabilityReasonSchema.nullable(),
});
export type AvailabilityDay = z.infer<typeof availabilityDaySchema>;

export const availabilityDaysResponseSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  days: z.array(availabilityDaySchema),
  /** ISO dates in the range that have at least one bookable slot. */
  availableDates: z.array(isoDateSchema),
});
export type AvailabilityDaysResponse = z.infer<typeof availabilityDaysResponseSchema>;
