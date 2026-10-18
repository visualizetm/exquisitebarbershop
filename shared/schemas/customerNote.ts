import { z } from 'zod';
import { idSchema, phoneSchema, timestampsSchema } from './common';

/** The owner's private note about a customer, keyed by phone (there are no customer accounts). */
export const customerNoteDocumentSchema = z
  .object({
    _id: idSchema,
    phone: phoneSchema,
    notes: z.string().trim().max(2000),
  })
  .extend(timestampsSchema.shape);
export type CustomerNoteDocument = z.infer<typeof customerNoteDocumentSchema>;
