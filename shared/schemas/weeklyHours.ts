import { z } from 'zod';
import { idSchema, weekHoursSchema } from './common';

export const hoursSubjectTypeSchema = z.enum(['shop', 'staff']);

/**
 * One document per subject: the shop itself (staffId null) or one staff member.
 * Staff hours are intersected with shop hours by the availability engine.
 */
export const weeklyHoursDocumentSchema = z
  .object({
    _id: idSchema,
    subjectType: hoursSubjectTypeSchema,
    staffId: idSchema.nullable(),
    days: weekHoursSchema,
    updatedAt: z.date(),
  })
  .refine((v) => (v.subjectType === 'shop') === (v.staffId === null), {
    message: 'Shop hours have no staffId; staff hours require one',
  });
export type WeeklyHoursDocument = z.infer<typeof weeklyHoursDocumentSchema>;

export const weeklyHoursInputSchema = z.object({ days: weekHoursSchema });
export type WeeklyHoursInput = z.input<typeof weeklyHoursInputSchema>;
