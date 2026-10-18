import { z } from 'zod';
import { idSchema, isoDateSchema, timestampsSchema } from './common';

/**
 * Something the owner has to decide. A barber who is out today leaves bookings in place and
 * raises "barberOut"; a barber who asks for days off that hold bookings raises "timeOffRequest".
 * An alert stays open until every booking it affects has an owner decision.
 */
export const alertKindSchema = z.enum(['barberOut', 'timeOffRequest']);
export type AlertKind = z.infer<typeof alertKindSchema>;

export const alertDocumentSchema = z
  .object({
    _id: idSchema,
    kind: alertKindSchema,
    staffId: idSchema,
    /** Shop dates covered, first and last day inclusive. */
    fromDate: isoDateSchema,
    toDate: isoDateSchema,
    /** The same range as UTC instants: what the time off covers. */
    startAt: z.date(),
    endAt: z.date(),
    reason: z.string().trim().max(200).nullable(),
    status: z.enum(['open', 'resolved', 'dismissed']),
    resolvedAt: z.date().nullable(),
    resolvedByUserId: idSchema.nullable(),
  })
  .extend(timestampsSchema.shape);
export type AlertDocument = z.infer<typeof alertDocumentSchema>;
