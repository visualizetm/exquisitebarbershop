import { z } from 'zod';
import { MAX_NOTE_LENGTH } from '../lib/constants';
import {
  centsSchema,
  emailSchema,
  idSchema,
  nonEmptyText,
  phoneSchema,
  referenceCodeSchema,
  timestampsSchema,
} from './common';
import { serviceGroupSchema } from './service';
import { actorTypeSchema } from './timeBlock';

export const bookingStatusSchema = z.enum(['confirmed', 'cancelled', 'completed', 'noShow']);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const bookingSourceSchema = z.enum(['online', 'walkIn', 'owner', 'barber']);
export type BookingSource = z.infer<typeof bookingSourceSchema>;

/** Snapshot of a service at booking time, so later price edits never rewrite history. */
export const bookingServiceSchema = z.object({
  serviceId: idSchema,
  name: nonEmptyText(80),
  group: serviceGroupSchema,
  priceCents: centsSchema,
  priceFrom: z.boolean(),
  durationMinutes: z.int().min(5),
});
export type BookingService = z.infer<typeof bookingServiceSchema>;

export const bookingCustomerSchema = z.object({
  name: nonEmptyText(80),
  phone: phoneSchema,
  email: emailSchema.nullable(),
});
export type BookingCustomer = z.infer<typeof bookingCustomerSchema>;

export const cancellationSchema = z.object({
  at: z.date(),
  by: actorTypeSchema,
  reason: z.string().trim().max(MAX_NOTE_LENGTH).nullable(),
});

export const bookingDocumentSchema = z
  .object({
    _id: idSchema,
    referenceCode: referenceCodeSchema,
    staffId: idSchema,
    /** False when the customer chose "first available" and the system picked the chair. */
    staffRequested: z.boolean(),
    services: z.array(bookingServiceSchema).min(1),
    startAt: z.date(),
    endAt: z.date(),
    durationMinutes: z.int().min(5),
    /** Buffer applied after this booking, captured so settings changes do not shift locks. */
    bufferMinutes: z.int().min(0),
    totalPriceCents: centsSchema,
    customer: bookingCustomerSchema,
    status: bookingStatusSchema,
    source: bookingSourceSchema,
    notes: z.string().trim().max(MAX_NOTE_LENGTH).nullable(),
    cancellation: cancellationSchema.nullable(),
    rescheduledFromId: idSchema.nullable(),
    /** Bumped on reschedule or cancel; manage links embed it so old links stop working. */
    manageTokenVersion: z.int().min(1),
  })
  .extend(timestampsSchema.shape)
  .refine((v) => v.endAt.getTime() > v.startAt.getTime(), {
    message: 'endAt must be after startAt',
  });
export type BookingDocument = z.infer<typeof bookingDocumentSchema>;
