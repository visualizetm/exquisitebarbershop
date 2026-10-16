import { z } from 'zod';
import { idSchema, isoDateSchema, nonEmptyText, timeIntervalSchema } from './common';

export const closureKindSchema = z.enum(['closed', 'specialHours']);

/** Shop-wide exceptions to weekly hours. One document per calendar day. */
export const closureDocumentSchema = z
  .object({
    _id: idSchema,
    date: isoDateSchema,
    kind: closureKindSchema,
    /** Only for specialHours: replaces the shop hours for that day. */
    intervals: z.array(timeIntervalSchema),
    label: nonEmptyText(80),
    createdAt: z.date(),
  })
  .refine((v) => (v.kind === 'closed' ? v.intervals.length === 0 : v.intervals.length > 0), {
    message: 'Closed days have no intervals; special hours need at least one',
  });
export type ClosureDocument = z.infer<typeof closureDocumentSchema>;

export const closureInputSchema = z
  .object({
    date: isoDateSchema,
    kind: closureKindSchema,
    intervals: z.array(timeIntervalSchema).default([]),
    label: nonEmptyText(80),
  })
  .refine((v) => (v.kind === 'closed' ? v.intervals.length === 0 : v.intervals.length > 0), {
    message: 'Closed days have no intervals; special hours need at least one',
  });
export type ClosureInput = z.input<typeof closureInputSchema>;
