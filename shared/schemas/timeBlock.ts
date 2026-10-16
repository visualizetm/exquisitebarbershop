import { z } from 'zod';
import { idSchema } from './common';

/**
 * timeOff: multi-day vacation, no locks, availability engine skips it.
 * block: short blocked period (lunch, walk-in in the chair). Takes slot locks so
 *   an online booking can never land on it.
 * dayOff: the owner toggled this person out for one day.
 * extraHours: the owner toggled this person in on a day they normally do not work.
 */
export const timeBlockKindSchema = z.enum(['timeOff', 'block', 'dayOff', 'extraHours']);
export type TimeBlockKind = z.infer<typeof timeBlockKindSchema>;

export const actorTypeSchema = z.enum(['owner', 'barber', 'customer', 'system']);

export const actorSchema = z.object({
  type: actorTypeSchema,
  userId: idSchema.nullable(),
  staffId: idSchema.nullable(),
});
export type Actor = z.infer<typeof actorSchema>;

export const timeBlockDocumentSchema = z
  .object({
    _id: idSchema,
    staffId: idSchema,
    kind: timeBlockKindSchema,
    startAt: z.date(),
    endAt: z.date(),
    reason: z.string().trim().max(200).nullable(),
    createdBy: actorSchema,
    createdAt: z.date(),
  })
  .refine((v) => v.endAt.getTime() > v.startAt.getTime(), {
    message: 'endAt must be after startAt',
  });
export type TimeBlockDocument = z.infer<typeof timeBlockDocumentSchema>;
