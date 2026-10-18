import { z } from 'zod';
import { idSchema, slugSchema, weekHoursSchema } from '../schemas/common';
import { serviceGroupSchema } from '../schemas/service';
import { addressSchema, announcementSchema } from '../schemas/shopSettings';
import { staffRoleSchema } from '../schemas/staff';
import { photoViewSchema } from './photos';

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
    /** Customers may cancel or move online until this many minutes before the start. */
    cancelCutoffMinutes: z.int(),
  }),
  /** The line in the strip above the header. Absent from older responses; the client then shows none. */
  announcement: announcementSchema.optional(),
  /** The home page hero, when the owner has uploaded one. */
  heroPhoto: photoViewSchema.nullable().optional(),
  /** MAINTENANCE_MODE is on: the site shows the maintenance message instead of its pages. */
  maintenance: z.boolean().optional(),
  /** DEMO_MODE is on: sample data, a demo sign-in, noindex, and the manage link shown on screen. */
  demo: z.boolean().optional(),
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
  /** The chair's portrait, when one has been uploaded. */
  photo: photoViewSchema.nullable().optional(),
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

/** Next starts for one chair, for the profile page. */
export const staffOpeningsQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(10).default(3),
});
export const openingSchema = z.object({
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  /** Shop-local date, for the /book link. */
  date: z.string(),
  /** "2:15 PM", "Tomorrow 10:00 AM" or "Thu 10:00 AM". */
  label: z.string(),
});
export type Opening = z.infer<typeof openingSchema>;
export const staffOpeningsResponseSchema = z.object({
  staff: z.object({ id: idSchema, slug: slugSchema, name: z.string() }),
  /** The service the openings are for, or null when the chair offers nothing online. */
  service: z.object({ id: idSchema, name: z.string(), durationMinutes: z.int() }).nullable(),
  openings: z.array(openingSchema),
});
export type StaffOpeningsResponse = z.infer<typeof staffOpeningsResponseSchema>;
