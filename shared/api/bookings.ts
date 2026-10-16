import { z } from 'zod';
import { MAX_NOTE_LENGTH } from '../lib/constants';
import {
  bookingCustomerSchema,
  bookingServiceSchema,
  bookingSourceSchema,
  bookingStatusSchema,
} from '../schemas/booking';
import { idSchema, referenceCodeSchema } from '../schemas/common';
import { staffSelectorSchema } from './availability';

export const createBookingRequestSchema = z.object({
  serviceIds: z.array(idSchema).min(1).max(6),
  staff: staffSelectorSchema,
  startAt: z.iso.datetime({ offset: true }),
  customer: bookingCustomerSchema,
  notes: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
  /** Honeypot. Hidden in the form; humans never fill it. Any value rejects the request. */
  website: z.string().max(200).optional(),
});
export type CreateBookingRequest = z.input<typeof createBookingRequestSchema>;
export type CreateBookingInput = z.output<typeof createBookingRequestSchema>;

/** The customer-facing view of a booking. No internal ids beyond what the UI needs. */
export const bookingViewSchema = z.object({
  id: idSchema,
  referenceCode: referenceCodeSchema,
  status: bookingStatusSchema,
  source: bookingSourceSchema,
  staff: z.object({ id: idSchema, name: z.string(), slug: z.string() }),
  staffRequested: z.boolean(),
  services: z.array(bookingServiceSchema),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  durationMinutes: z.int(),
  totalPriceCents: z.int(),
  customer: z.object({ name: z.string(), phone: z.string(), email: z.string().nullable() }),
  notes: z.string().nullable(),
  /** Calendar sequence number: rises on every reschedule so calendar apps replace the event. */
  sequence: z.int(),
  createdAt: z.iso.datetime(),
});
export type BookingView = z.infer<typeof bookingViewSchema>;

export const createBookingResponseSchema = z.object({
  booking: bookingViewSchema,
  /** Relative path for the manage page, also sent in the confirmation email. */
  managePath: z.string(),
});
export type CreateBookingResponse = z.infer<typeof createBookingResponseSchema>;

/** Manage link flows. The token is the signed value from the confirmation email. */
export const manageTokenQuerySchema = z.object({ token: z.string().min(20).max(512) });

export const manageBookingResponseSchema = z.object({
  booking: bookingViewSchema,
  canCancel: z.boolean(),
  canReschedule: z.boolean(),
  cutoffs: z.object({ cancelMinutes: z.int(), rescheduleMinutes: z.int() }),
});
export type ManageBookingResponse = z.infer<typeof manageBookingResponseSchema>;

export const cancelBookingRequestSchema = z.object({
  token: z.string().min(20).max(512),
  reason: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});
export type CancelBookingRequest = z.input<typeof cancelBookingRequestSchema>;

export const rescheduleBookingRequestSchema = z.object({
  token: z.string().min(20).max(512),
  startAt: z.iso.datetime({ offset: true }),
  /** Defaults to the same chair. */
  staff: staffSelectorSchema.optional(),
});
export type RescheduleBookingRequest = z.input<typeof rescheduleBookingRequestSchema>;

export const rescheduleBookingResponseSchema = createBookingResponseSchema;
export type RescheduleBookingResponse = z.infer<typeof rescheduleBookingResponseSchema>;
