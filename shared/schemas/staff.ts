import { z } from 'zod';
import { idSchema, nonEmptyText, slugSchema, timestampsSchema } from './common';

export const staffRoleSchema = z.enum(['owner', 'barber', 'stylist']);
export type StaffRole = z.infer<typeof staffRoleSchema>;

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
