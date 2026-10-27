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

export const bookingSourceSchema = z.enum(['online', 'walkIn', 'owner', 'barber', 'phone']);
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

/** A discount applied by the server at booking time. The list is empty on most bookings. */
export const discountSchema = z.object({
  code: z.enum(['LAUNCH10']),
  amountCents: centsSchema,
  label: nonEmptyText(80),
});
export type Discount = z.infer<typeof discountSchema>;

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
    /** The price of the services. What the client pays is this minus the discounts. */
    totalPriceCents: centsSchema,
    discounts: z.array(discountSchema).default([]),
    customer: bookingCustomerSchema,
    status: bookingStatusSchema,
    source: bookingSourceSchema,
    notes: z.string().trim().max(MAX_NOTE_LENGTH).nullable(),
    cancellation: cancellationSchema.nullable(),
    rescheduledFromId: idSchema.nullable(),
    /** Bumped on reschedule or cancel; manage links embed it so old links stop working. */
    manageTokenVersion: z.int().min(1),
    /** When the owner first opened it. Online bookings without it show as new. */
    ownerSeenAt: z.date().nullable().optional(),
    /** The floor: when the client checked in at the shop, and when the cut started. */
    arrivedAt: z.date().nullable().optional(),
    startedAt: z.date().nullable().optional(),
    /** The customer name without accents or case, for the owner's search. Set on insert. */
    nameKey: z.string().max(200).optional(),
  })
  .extend(timestampsSchema.shape)
  .refine((v) => v.endAt.getTime() > v.startAt.getTime(), {
    message: 'endAt must be after startAt',
  });
export type BookingDocument = z.infer<typeof bookingDocumentSchema>;
