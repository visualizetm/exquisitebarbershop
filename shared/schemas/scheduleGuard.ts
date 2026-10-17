import { z } from 'zod';
import { idSchema } from './common';

/**
 * One document per chair, bumped by every transaction that books the chair or
 * changes when it works. Two such transactions on the same chair then write the
 * same document, so MongoDB makes one of them retry on a fresh snapshot. That
 * closes the gap where a booking could land in hours that were just removed.
 */
export const scheduleGuardDocumentSchema = z.object({
  /** The staffId. */
  _id: idSchema,
  version: z.int().min(0),
  updatedAt: z.date(),
});
export type ScheduleGuardDocument = z.infer<typeof scheduleGuardDocumentSchema>;
