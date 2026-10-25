import { z } from 'zod';
import { idSchema, slugSchema, weekHoursSchema } from '../schemas/common';
import { serviceGroupSchema } from '../schemas/service';
import {
  addressSchema,
  announcementSchema,
  googleSettingsSchema,
  reviewSourceSchema,
  socialLinksSchema,
} from '../schemas/shopSettings';
import { servicePriceSchema, staffRoleSchema } from '../schemas/staff';
import { photoViewSchema } from './photos';

/** A review as the public site gets it: only shown ones, already in the owner's order. */
export const publicReviewSchema = z.object({
  id: idSchema,
  name: z.string(),
  text: z.string(),
  stars: z.int(),
  source: reviewSourceSchema,
  /** YYYY-MM-DD, or null when the source shows no exact date (theCut). */
  date: z.string().nullable(),
  /** The chair the review is about, or null for the shop as a whole. */
  staffId: idSchema.nullable(),
});
export type PublicReview = z.infer<typeof publicReviewSchema>;

/** Public shop information for the Visit page, the footer and SEO. */
export const publicShopSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  address: addressSchema,
  phone: z.string(),
  /** Empty while the stored address is still the stand-in, so no public page prints it. */
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
  social: socialLinksSchema.optional(),
  /** The Google Business Profile: place id for the Maps and review links, plus the rating shown. */
  google: googleSettingsSchema.optional(),
  /** The reviews to show, in order. Empty while the section is off or every review is hidden. */
  reviews: z.array(publicReviewSchema).max(30).optional(),
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
  /** This person's own prices and times, where they differ from the shop's. Public on the menu. */
  servicePrices: z.array(servicePriceSchema).default([]),
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
