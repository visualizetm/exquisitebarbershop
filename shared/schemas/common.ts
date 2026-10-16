import { z } from 'zod';
import { normalizeUsPhone } from '../lib/phone';
import { isValidSlug, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from '../lib/slug';
import { DAY_KEYS, HHMM_PATTERN, isIsoDate } from '../lib/time';
import { REFERENCE_CODE_PATTERN } from '../lib/referenceCode';

/** Document and reference ids are 24 lowercase hex characters (ObjectId hex strings). */
export const idSchema = z.string().regex(/^[0-9a-f]{24}$/, 'Invalid id');
export type Id = z.infer<typeof idSchema>;

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, 'Expected a calendar date in YYYY-MM-DD form');

export const hhmmSchema = z.string().regex(HHMM_PATTERN, 'Expected a time in HH:mm form');

export const dayKeySchema = z.enum(DAY_KEYS);

export const timeIntervalSchema = z
  .object({ start: hhmmSchema, end: hhmmSchema })
  .refine((v) => v.start < v.end, { message: 'Interval end must be after start' });
export type TimeInterval = z.infer<typeof timeIntervalSchema>;

/** Hours for each day of the week; an empty array means closed or off that day. */
export const weekHoursSchema = z.object({
  mon: z.array(timeIntervalSchema),
  tue: z.array(timeIntervalSchema),
  wed: z.array(timeIntervalSchema),
  thu: z.array(timeIntervalSchema),
  fri: z.array(timeIntervalSchema),
  sat: z.array(timeIntervalSchema),
  sun: z.array(timeIntervalSchema),
});
export type WeekHours = z.infer<typeof weekHoursSchema>;

export const slugSchema = z
  .string()
  .min(SLUG_MIN_LENGTH)
  .max(SLUG_MAX_LENGTH)
  .refine(isValidSlug, 'Slug must be lowercase letters, digits and single hyphens');

export const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());

/** Accepts any US phone formatting and normalizes to E.164. */
export const phoneSchema = z
  .string()
  .min(10)
  .max(32)
  .transform((raw, ctx) => {
    const normalized = normalizeUsPhone(raw);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid US phone number' });
      return z.NEVER;
    }
    return normalized;
  });

export const referenceCodeSchema = z.string().regex(REFERENCE_CODE_PATTERN);

export const centsSchema = z.int().min(0).max(1_000_000_00);

export const minutesSchema = z
  .int()
  .min(0)
  .max(24 * 60);

export const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);

export const timestampsSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
});
