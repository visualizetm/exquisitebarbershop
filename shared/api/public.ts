import { z } from 'zod';
import { idSchema, slugSchema, weekHoursSchema } from '../schemas/common';
import { serviceGroupSchema } from '../schemas/service';
import { addressSchema } from '../schemas/shopSettings';
import { staffRoleSchema } from '../schemas/staff';

/** Public shop information for the Visit page, the footer and SEO. */
export const publicShopSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  address: addressSchema,
  phone: z.string(),
  email: z.string(),
  instagramHandle: z.string(),
  timezone: z.string(),
  hours: weekHoursSchema,
  booking: z.object({
    slotStepMinutes: z.int(),
    leadTimeMinutes: z.int(),
    bookingWindowDays: z.int(),
    maxServicesPerBooking: z.int(),
    allowFirstAvailable: z.boolean(),
    requireEmail: z.boolean(),
  }),
});
export type PublicShop = z.infer<typeof publicShopSchema>;

export const publicServiceSchema = z.object({
  id: idSchema,
  name: z.string(),
  group: serviceGroupSchema,
  description: z.string(),
  priceCents: z.int(),
  priceFrom: z.boolean(),
  durationMinutes: z.int(),
  sortOrder: z.int(),
});
export type PublicService = z.infer<typeof publicServiceSchema>;
export const publicServicesResponseSchema = z.object({ services: z.array(publicServiceSchema) });

export const publicStaffSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string(),
  role: staffRoleSchema,
  title: z.string(),
  specialty: z.string(),
  bio: z.string(),
  chairNumber: z.int().nullable(),
  serviceIds: z.array(idSchema),
  photoUrl: z.string().nullable(),
  instagramHandle: z.string().nullable(),
  acceptsOnlineBooking: z.boolean(),
  sortOrder: z.int(),
});
export type PublicStaff = z.infer<typeof publicStaffSchema>;
export const publicStaffListResponseSchema = z.object({ staff: z.array(publicStaffSchema) });

/** A lookup by an old slug returns the record plus the canonical slug so the client can redirect. */
export const publicStaffResponseSchema = z.object({
  staff: publicStaffSchema,
  requestedSlug: z.string(),
  canonical: z.boolean(),
});
export type PublicStaffResponse = z.infer<typeof publicStaffResponseSchema>;
