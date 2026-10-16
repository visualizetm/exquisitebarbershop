import { z } from 'zod';
import { idSchema } from './common';

export const lockHolderTypeSchema = z.enum(['booking', 'timeBlock']);

/**
 * One document per 15 minute block held for a staff member. The unique index on
 * (staffId, slotStart) is what makes double booking impossible.
 */
export const slotLockDocumentSchema = z.object({
  _id: idSchema,
  staffId: idSchema,
  slotStart: z.date(),
  holderType: lockHolderTypeSchema,
  holderId: idSchema,
  createdAt: z.date(),
});
export type SlotLockDocument = z.infer<typeof slotLockDocumentSchema>;
