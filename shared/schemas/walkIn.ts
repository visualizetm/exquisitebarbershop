import { z } from 'zod';
import { MAX_NOTE_LENGTH } from '../lib/constants';
import { idSchema, nonEmptyText, phoneSchema } from './common';
import { actorSchema } from './timeBlock';

export const walkInStatusSchema = z.enum(['waiting', 'seated', 'left']);
export type WalkInStatus = z.infer<typeof walkInStatusSchema>;

/**
 * One person in the walk-in line. Waiting entries are ordered by position; seating turns one into
 * a real booking (bookingId) through the booking service and its slot locks. The phone is stored
 * in E.164 like every other number in the system and shown as (XXX) XXX-XXXX.
 */
export const walkInDocumentSchema = z.object({
  _id: idSchema,
  name: nonEmptyText(80),
  phone: phoneSchema,
  serviceIds: z.array(idSchema).min(1).max(6),
  /** Null means first available: any chair that frees up. */
  staffId: idSchema.nullable(),
  status: walkInStatusSchema,
  position: z.int().min(0),
  note: z.string().trim().max(MAX_NOTE_LENGTH).nullable(),
  createdAt: z.date(),
  seatedAt: z.date().nullable(),
  leftAt: z.date().nullable(),
  bookingId: idSchema.nullable(),
  createdBy: actorSchema,
});
export type WalkInDocument = z.infer<typeof walkInDocumentSchema>;
