import { z } from 'zod';
import { idSchema } from './common';
import { actorSchema } from './timeBlock';

export const photoKindSchema = z.enum(['staff', 'gallery', 'hero']);
export type PhotoKind = z.infer<typeof photoKindSchema>;

/** Only these go through the upload flow. The browser re-encodes to WebP first. */
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** An optional folder every key sits under, so preview deployments can share a bucket. */
export const KEY_PREFIX_PATTERN = /^[a-z0-9][a-z0-9-]*\/$/;

/** A Cloudinary folder: lowercase segments joined by slashes, such as exquisite/production. */
export const CLOUDINARY_FOLDER_PATTERN = /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/;

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Object keys are always server generated: `staff/<staffId>/<uuid>.webp`,
 * `gallery/<uuid>.webp` or `hero/<uuid>.webp`, under R2_KEY_PREFIX when set.
 */
const FILE_KEY = new RegExp(
  `^(?:[a-z0-9][a-z0-9-]*/)?(?:staff/[0-9a-f]{24}|gallery|hero)/${UUID_PATTERN}\\.webp$`,
);
/** A Cloudinary public id: the folder, then a uuid, with no extension. */
const CLOUDINARY_KEY = new RegExp(`^(?:[a-z0-9][a-z0-9_-]*/)+${UUID_PATTERN}$`);

export const photoKeySchema = z
  .string()
  .refine((key) => FILE_KEY.test(key) || CLOUDINARY_KEY.test(key), 'Not a photo key');

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
