import { z } from 'zod';
import { idSchema } from './common';
import { actorSchema } from './timeBlock';

export const auditLogDocumentSchema = z.object({
  _id: idSchema,
  at: z.date(),
  actor: actorSchema,
  /** Dotted verb such as "booking.create" or "staff.slug.rename". */
  action: z.string().regex(/^[a-z]+(?:\.[a-zA-Z]+)+$/),
  entityType: z.string().min(1).max(40),
  entityId: z.string().min(1).max(64),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  requestId: z.string().max(64).nullable(),
});
export type AuditLogDocument = z.infer<typeof auditLogDocumentSchema>;
