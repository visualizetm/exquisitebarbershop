import { z } from 'zod';
import { idSchema } from './common';
import { PHOTO_CONTENT_TYPES, photoKeySchema, photoKindSchema } from './photo';

/**
 * An upload URL that was issued but not confirmed yet. Confirming removes the
 * record; the daily sweep deletes the object behind any record older than an hour.
 */
export const pendingUploadDocumentSchema = z.object({
  _id: idSchema,
  key: photoKeySchema,
  kind: photoKindSchema,
  staffId: idSchema.nullable(),
  contentType: z.enum(PHOTO_CONTENT_TYPES),
  size: z.int().min(1),
  issuedAt: z.date(),
});
export type PendingUploadDocument = z.infer<typeof pendingUploadDocumentSchema>;
