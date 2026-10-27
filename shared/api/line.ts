import { z } from 'zod';
import { MAX_NOTE_LENGTH } from '../lib/constants';
import { bookingCustomerSchema } from '../schemas/booking';
import { idSchema, phoneSchema } from '../schemas/common';
import { walkInStatusSchema } from '../schemas/walkIn';

/** "Free now", "about 2:50 (36 min)" or unknown. */
export const waitEstimateViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('free') }),
  z.object({ kind: z.literal('about'), at: z.iso.datetime(), minutes: z.int().min(0) }),
  z.object({ kind: z.literal('unknown') }),
]);
export type WaitEstimateView = z.infer<typeof waitEstimateViewSchema>;

/** Whether a walk-in can be taken right now, and if not the sentence that says why. */
export const nowGateViewSchema = z.object({
  kind: z.enum(['open', 'closed', 'off', 'done', 'nobody']),
  text: z.string().nullable(),
});
export type NowGateView = z.infer<typeof nowGateViewSchema>;

export const chairEstimateSchema = z.object({
  staffId: idSchema,
  name: z.string(),
  chairNumber: z.int().nullable(),
  gate: nowGateViewSchema,
  estimate: waitEstimateViewSchema,
});
export type ChairEstimate = z.infer<typeof chairEstimateSchema>;

export const walkInViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** Shown as (XXX) XXX-XXXX. */
  phone: z.string(),
  services: z.array(z.object({ id: idSchema, name: z.string() })),
  serviceMinutes: z.int(),
  staffId: idSchema.nullable(),
  /** The chair's name, or "First available". */
  staffName: z.string(),
  status: walkInStatusSchema,
  position: z.int(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
  seatedAt: z.iso.datetime().nullable(),
  bookingId: idSchema.nullable(),
  waitingMinutes: z.int().min(0),
  estimate: waitEstimateViewSchema,
  /** For first available: the chair the estimate expects to free up first. */
  expectedStaffId: idSchema.nullable(),
  /** "Drew is off. Move or mark left" when the chair they wait for is no longer taking anyone. */
  flag: z.string().nullable(),
  /** The same person on every other chair, for Move. */
  options: z.array(chairEstimateSchema),
});
export type WalkInView = z.infer<typeof walkInViewSchema>;

export const lineResponseSchema = z.object({
  now: z.iso.datetime(),
  line: z.array(walkInViewSchema),
  chairs: z.array(chairEstimateSchema),
  /** The gate for "first available": the shop open and somebody in. */
  firstAvailable: nowGateViewSchema,
});
export type LineResponse = z.infer<typeof lineResponseSchema>;

export const lineAddRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: phoneSchema,
  serviceIds: z.array(idSchema).min(1).max(6),
  /** Null or missing means first available. */
  staffId: idSchema.nullable().optional(),
  note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});
export type LineAddRequest = z.input<typeof lineAddRequestSchema>;

export const lineUpdateRequestSchema = z
  .object({
    staffId: idSchema.nullable().optional(),
    serviceIds: z.array(idSchema).min(1).max(6).optional(),
  })
  .refine((v) => v.staffId !== undefined || v.serviceIds !== undefined, {
    message: 'Nothing to change',
  });

export const lineMoveRequestSchema = z.object({ direction: z.enum(['up', 'down']) });

export const lineSeatRequestSchema = z.object({
  /** The chair to seat at; required when the walk-in is first available. */
  staffId: idSchema.optional(),
});

export const walkInResponseSchema = z.object({ walkIn: walkInViewSchema });

/** NOW: a walk-in booked this minute when the chair is free, else a place in the line. */
export const nowRequestSchema = z.object({
  serviceIds: z.array(idSchema).min(1).max(6),
  /** Null or missing means first available. */
  staffId: idSchema.nullable().optional(),
  customer: bookingCustomerSchema,
  notes: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});
export type NowRequest = z.input<typeof nowRequestSchema>;

/** A barber booking a later time on their own chair. */
export const teamBookingRequestSchema = z.object({
  serviceIds: z.array(idSchema).min(1).max(6),
  startAt: z.iso.datetime({ offset: true }),
  customer: bookingCustomerSchema,
  notes: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});
export type TeamBookingRequest = z.input<typeof teamBookingRequestSchema>;
