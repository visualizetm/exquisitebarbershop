import { z } from 'zod';
import { centsSchema, idSchema, nonEmptyText, timestampsSchema } from './common';

export const serviceGroupSchema = z.enum(['Barber', 'Beauty']);
export type ServiceGroup = z.infer<typeof serviceGroupSchema>;

export const serviceDocumentSchema = z
  .object({
    _id: idSchema,
    name: nonEmptyText(80),
    group: serviceGroupSchema,
    description: z.string().trim().max(500),
    priceCents: centsSchema,
    /** When true the price is a starting point and the UI shows "From $x". */
    priceFrom: z.boolean(),
    durationMinutes: z
      .int()
      .min(5)
      .max(8 * 60)
      .multipleOf(5),
    sortOrder: z.int().min(0),
    /** Temporarily hidden from booking without deleting. */
    isActive: z.boolean(),
    deletedAt: z.date().nullable(),
  })
  .extend(timestampsSchema.shape);
export type ServiceDocument = z.infer<typeof serviceDocumentSchema>;

export const serviceInputSchema = serviceDocumentSchema.omit({
  _id: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type ServiceInput = z.input<typeof serviceInputSchema>;
export const serviceUpdateSchema = serviceInputSchema.partial();
export type ServiceUpdate = z.input<typeof serviceUpdateSchema>;
