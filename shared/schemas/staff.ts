import { z } from 'zod';
import { centsSchema, idSchema, nonEmptyText, slugSchema, timestampsSchema } from './common';
import { serviceDurationSchema } from './service';

export const staffRoleSchema = z.enum(['owner', 'barber', 'stylist']);
export type StaffRole = z.infer<typeof staffRoleSchema>;

/** Most overrides one person can hold: the menu is far smaller, this only bounds a bad request. */
export const SERVICE_PRICES_MAX = 100;

/**
 * One person's own price, and optionally their own time, for a service they offer. A service
 * without an entry uses the shop's price and time (services collection).
 */
export const servicePriceSchema = z.object({
  serviceId: idSchema,
  priceCents: centsSchema,
  durationMinutes: serviceDurationSchema.optional(),
});
export type ServicePrice = z.infer<typeof servicePriceSchema>;

/** At most one entry per service. Whether each service is on the person's menu is checked with it. */
export const servicePricesSchema = z
  .array(servicePriceSchema)
  .max(SERVICE_PRICES_MAX)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((entry, index) => {
      if (seen.has(entry.serviceId)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'serviceId'],
          message: 'Only one price per service',
        });
      }
      seen.add(entry.serviceId);
    });
  });

export const staffDocumentSchema = z
  .object({
    _id: idSchema,
    /** Current public slug used in /chairs/:slug and /book?barber=. */
    slug: slugSchema,
    /** Every former slug. Old links keep resolving to this person forever. */
    slugAliases: z.array(slugSchema),
    /**
     * Derived: [slug, ...slugAliases]. Maintained by the repository only. A unique
     * multikey index on this field guarantees no slug, current or old, is shared
     * by two staff members.
     */
    slugKeys: z.array(slugSchema).min(1),
    name: nonEmptyText(80),
    role: staffRoleSchema,
    /** Short title shown under the name, for example "Master Barber". */
    title: nonEmptyText(80),
    specialty: z.string().trim().max(200),
    bio: z.string().trim().max(2000),
    chairNumber: z.int().min(1).max(99).nullable(),
    serviceIds: z.array(idSchema),
    /**
     * Per person prices and times that differ from the shop's. Optional: documents written
     * before the field existed have none, which reads the same as an empty list.
     */
    servicePrices: servicePricesSchema.optional(),
    photoUrl: z.url().nullable(),
    instagramHandle: z
      .string()
      .regex(/^[A-Za-z0-9._]{1,30}$/)
      .nullable(),
    sortOrder: z.int().min(0),
    acceptsOnlineBooking: z.boolean(),
    showOnWebsite: z.boolean(),
    deletedAt: z.date().nullable(),
  })
  .extend(timestampsSchema.shape);
export type StaffDocument = z.infer<typeof staffDocumentSchema>;

/** Owner-editable fields when creating or updating staff. */
export const staffInputSchema = staffDocumentSchema.omit({
  _id: true,
  slugAliases: true,
  slugKeys: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type StaffInput = z.input<typeof staffInputSchema>;
export const staffUpdateSchema = staffInputSchema.partial();
export type StaffUpdate = z.input<typeof staffUpdateSchema>;
