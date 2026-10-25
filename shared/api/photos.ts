import { z } from 'zod';
import { idSchema } from '../schemas/common';
import { PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES, photoKindSchema } from '../schemas/photo';

/** A photo as every page sees it. The URL is public; nothing is signed. */
export const photoViewSchema = z.object({
  id: idSchema,
  url: z.url(),
  width: z.int(),
  height: z.int(),
  alt: z.string(),
  /** Set for Cloudinary photos: the browser asks for exact sizes (four widths, cropped to the frame). */
  delivery: z.object({ cloud: z.string(), publicId: z.string() }).nullable().optional(),
});
export type PhotoView = z.infer<typeof photoViewSchema>;

export const galleryPhotoSchema = photoViewSchema.extend({
  staff: z.object({ id: idSchema, name: z.string(), slug: z.string() }).nullable(),
});
export type GalleryPhoto = z.infer<typeof galleryPhotoSchema>;

export const galleryQuerySchema = z.object({
  /** A staff slug or alias. */
  staff: z.string().min(1).max(60).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  /** The Home order: the photos the shop picked for Home first, then the rest of the gallery. */
  home: z.stringbool().optional(),
});
export const galleryResponseSchema = z.object({
  photos: z.array(galleryPhotoSchema),
  nextCursor: z.string().nullable(),
  /** Photo counts per chair, for the filter chips. */
  counts: z.array(
    z.object({ staffId: idSchema, slug: z.string(), name: z.string(), count: z.int() }),
  ),
  total: z.int(),
});
export type GalleryResponse = z.infer<typeof galleryResponseSchema>;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminPhotoViewSchema = photoViewSchema.extend({
  kind: photoKindSchema,
  staffId: idSchema.nullable(),
  sortOrder: z.int(),
  createdAt: z.iso.datetime(),
});
export type AdminPhotoView = z.infer<typeof adminPhotoViewSchema>;

export const uploadUrlRequestSchema = z.object({
  kind: photoKindSchema,
  staffId: idSchema.optional(),
  contentType: z.enum(PHOTO_CONTENT_TYPES),
  size: z.int().min(1).max(PHOTO_MAX_BYTES),
});
export type UploadUrlRequest = z.input<typeof uploadUrlRequestSchema>;

export const uploadUrlResponseSchema = z.object({
  /** PUT the bytes here (or POST the form, for Cloudinary) within five minutes. */
  uploadUrl: z.url(),
  method: z.enum(['PUT', 'POST']),
  /** For a PUT: the headers to send, including the Content-Type. */
  headers: z.record(z.string(), z.string()),
  /** For a POST: the signed form fields to send before the file. Cloudinary only. */
  fields: z.record(z.string(), z.string()).optional(),
  key: z.string(),
  /** Hand it back to confirm. It binds the key to the kind, chair, type and size. */
  ticket: z.string(),
  expiresAt: z.iso.datetime(),
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

/** What Cloudinary answered after the browser upload; the server checks it against the asset itself. */
export const cloudinaryResultSchema = z.object({
  publicId: z.string().min(1).max(300),
  version: z.int().min(0),
  bytes: z.int().min(1),
});

export const confirmUploadRequestSchema = z.object({
  ticket: z.string().min(20).max(2000),
  /** Required when the photo went to Cloudinary. */
  cloudinary: cloudinaryResultSchema.optional(),
  width: z.int().min(1).max(10_000),
  height: z.int().min(1).max(10_000),
  alt: z.string().trim().min(1).max(200),
});
export type ConfirmUploadRequest = z.input<typeof confirmUploadRequestSchema>;

export const photoPatchRequestSchema = z
  .object({
    alt: z.string().trim().min(1).max(200).optional(),
    sortOrder: z.int().min(0).optional(),
    /** Gallery photos only, owner only: whose work it is. Null credits nobody in particular. */
    staffId: idSchema.nullable().optional(),
  })
  .refine((v) => v.alt !== undefined || v.sortOrder !== undefined || v.staffId !== undefined, {
    message: 'Nothing to change',
  });

export const adminPhotoListQuerySchema = z.object({
  kind: photoKindSchema.optional(),
  staffId: idSchema.optional(),
});
export const adminPhotoListResponseSchema = z.object({ photos: z.array(adminPhotoViewSchema) });
export const adminPhotoResponseSchema = z.object({ photo: adminPhotoViewSchema });
