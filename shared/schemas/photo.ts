import { z } from 'zod';
import { idSchema } from './common';
import { actorSchema } from './timeBlock';

export const photoKindSchema = z.enum(['staff', 'gallery', 'hero']);
export type PhotoKind = z.infer<typeof photoKindSchema>;

/** Only these go through the upload flow. The browser re-encodes to WebP first. */
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Object keys are always server generated: `staff/<staffId>/<uuid>.webp`,
 * `gallery/<uuid>.webp` or `hero/<uuid>.webp`.
 */
export const photoKeySchema = z
  .string()
  .regex(
    /^(?:staff\/[0-9a-f]{24}|gallery|hero)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/,
  );

export const photoDocumentSchema = z.object({
  _id: idSchema,
  kind: photoKindSchema,
  /** Set for staff photos and for gallery photos credited to a chair. */
  staffId: idSchema.nullable(),
  key: photoKeySchema,
  width: z.int().min(1).max(10_000),
  height: z.int().min(1).max(10_000),
  alt: z.string().trim().min(1).max(200),
  sortOrder: z.int().min(0),
  createdBy: actorSchema,
  createdAt: z.date(),
  /** Soft delete. The object is removed from storage afterwards (purgedAt). */
  deletedAt: z.date().nullable(),
  purgedAt: z.date().nullable(),
});
export type PhotoDocument = z.infer<typeof photoDocumentSchema>;
