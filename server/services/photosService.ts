import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  AdminPhotoView,
  ConfirmUploadRequest,
  GalleryPhoto,
  GalleryResponse,
  PhotoView,
  UploadUrlRequest,
  UploadUrlResponse,
} from '../../shared/api/photos';
import { idSchema } from '../../shared/schemas/common';
import {
  PHOTO_CONTENT_TYPES,
  photoKindSchema,
  type PhotoDocument,
  type PhotoKind,
} from '../../shared/schemas/photo';
import type { StaffDocument } from '../../shared/schemas/staff';
import { getEnv } from '../env';
import type { Principal } from '../http/types';
import { AppError } from '../lib/errors';
import { signPayload, verifyPayload } from '../lib/signedPayload';
import {
  auditLogRepo,
  pendingUploadsRepo,
  photosRepo,
  shopSettingsRepo,
  staffRepo,
} from '../repos';
import {
  assertStorageEnabled,
  getStorage,
  maxUploadBytes,
  newPhotoKey,
  storageEnabled,
} from '../storage';
import { ORPHAN_AGE_MS } from '../storage/cloudinary';
import { actorOf } from './access';
import type { ServiceMeta } from './adminBookings';
import { cursors } from './adminBookings';

/** How long an issued upload URL and its ticket stay valid. */
export const UPLOAD_TTL_SECONDS = 5 * 60;
/** An issued upload that is not confirmed within this time is swept from storage. */
export const ABANDONED_UPLOAD_MS = 60 * 60_000;
const TICKET_PREFIX = 'u1';

const ticketSchema = z.object({
  k: z.string(),
  kind: photoKindSchema,
  s: idSchema.nullable(),
  ct: z.enum(PHOTO_CONTENT_TYPES),
  n: z.int().min(1),
  exp: z.int(),
});

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export function toPhotoView(p: PhotoDocument): PhotoView {
  const storage = getStorage();
  const delivery = storage.delivery?.(p.key);
  return {
    id: p._id,
    url: storage.publicUrl(p.key),
    width: p.width,
    height: p.height,
    alt: p.alt,
    ...(delivery ? { delivery } : {}),
  };
}

export function toAdminPhotoView(p: PhotoDocument): AdminPhotoView {
  return {
    ...toPhotoView(p),
    kind: p.kind,
    staffId: p.staffId,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/**
 * The owner manages every photo. A barber may only touch their own chair's
 * staff photos, and only while the owner setting allows it.
 */
async function assertCanManage(
  principal: Principal,
  kind: PhotoKind,
  staffId: string | null,
): Promise<void> {
  if (principal.role === 'owner') return;
  const settings = await shopSettingsRepo.requireShopSettings();
  if (
    !settings.permissions.barbersCanUploadPhotos ||
    kind !== 'staff' ||
    !principal.staffId ||
    staffId !== principal.staffId
  ) {
    throw new AppError('FORBIDDEN', 'You can only manage photos of your own chair');
  }
}

async function liveStaff(staffId: string): Promise<StaffDocument> {
  const staff = await staffRepo.findStaffById(staffId);
  if (!staff || staff.deletedAt) throw new AppError('NOT_FOUND', 'Staff member was not found');
  return staff;
}

/** A barber's own photos read as not found when they are someone else's, like any other record. */
async function loadManaged(principal: Principal, id: string): Promise<PhotoDocument> {
  const photo = await photosRepo.findPhotoById(id);
  if (!photo || photo.deletedAt) throw new AppError('NOT_FOUND', 'Photo was not found');
  if (
    principal.role !== 'owner' &&
    (photo.kind !== 'staff' || photo.staffId !== principal.staffId)
  ) {
    throw new AppError('NOT_FOUND', 'Photo was not found');
  }
  await assertCanManage(principal, photo.kind, photo.staffId);
  return photo;
}

// ---------------------------------------------------------------------------
// Upload flow
// ---------------------------------------------------------------------------

export async function issueUploadUrl(
  principal: Principal,
  input: UploadUrlRequest,
  meta: ServiceMeta,
): Promise<UploadUrlResponse> {
  assertStorageEnabled();
  if (input.size > maxUploadBytes()) {
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      `Photos can be up to ${String(Math.floor(maxUploadBytes() / (1024 * 1024)))} MB after the resize`,
    );
  }
  const staffId = input.kind === 'hero' ? null : (input.staffId ?? null);
  if (input.kind === 'staff' && !staffId) {
    throw new AppError('VALIDATION_ERROR', 'A staff photo needs a staffId', {
      details: [{ path: 'staffId', message: 'Required for staff photos' }],
    });
  }
  await assertCanManage(principal, input.kind, staffId);
  if (staffId) await liveStaff(staffId);

  const key = newPhotoKey(input.kind, staffId, randomUUID());
  const upload = await getStorage().presignUpload({
    key,
    contentType: input.contentType,
    size: input.size,
    expiresInSeconds: UPLOAD_TTL_SECONDS,
  });
  await pendingUploadsRepo.insertPendingUpload(
    { key, kind: input.kind, staffId, contentType: input.contentType, size: input.size },
    meta.now,
  );
  const exp = Math.floor(meta.now.getTime() / 1000) + UPLOAD_TTL_SECONDS;
  const ticket = signPayload(getEnv().MANAGE_LINK_SECRET, TICKET_PREFIX, {
    k: key,
    kind: input.kind,
    s: staffId,
    ct: input.contentType,
    n: input.size,
    exp,
  });
  return {
    uploadUrl: upload.url,
    method: upload.method,
    headers: upload.method === 'PUT' ? upload.headers : {},
    ...(upload.method === 'POST' ? { fields: upload.fields } : {}),
    key,
    ticket,
    expiresAt: upload.expiresAt.toISOString(),
  };
}

export async function confirmUpload(
  principal: Principal,
  input: ConfirmUploadRequest,
  meta: ServiceMeta,
): Promise<AdminPhotoView> {
  assertStorageEnabled();
  const issued = verifyPayload(
    getEnv().MANAGE_LINK_SECRET,
    TICKET_PREFIX,
    input.ticket,
    ticketSchema,
    meta.now,
  );
  if (!issued) throw new AppError('INVALID_TOKEN', 'That upload is not valid or has expired');
  await assertCanManage(principal, issued.kind, issued.s);

  const storage = getStorage();
  // On Cloudinary the browser reports what it got back; it must be the asset this ticket was issued
  // for, so a ticket cannot be used to claim someone else's upload.
  if (storage.name === 'cloudinary' && input.cloudinary?.publicId !== issued.k) {
    throw new AppError('INVALID_TOKEN', 'That upload is not the one this ticket was issued for');
  }
  const stored = await storage.head(issued.k);
  if (!stored) throw new AppError('CONFLICT', 'The file was not uploaded');
  if (
    stored.size !== issued.n ||
    stored.contentType !== issued.ct ||
    stored.size > maxUploadBytes() ||
    (storage.name === 'cloudinary' &&
      (stored.version !== input.cloudinary?.version || stored.size !== input.cloudinary?.bytes))
  ) {
    // The object stays nowhere: a mismatch is removed before the caller hears about it.
    await getStorage().delete(issued.k);
    await pendingUploadsRepo.deletePendingUploadByKey(issued.k);
    throw new AppError('CONFLICT', 'The uploaded file does not match what was declared');
  }
  await pendingUploadsRepo.deletePendingUploadByKey(issued.k);

  const sortOrder = await photosRepo.nextSortOrder({ kind: issued.kind, staffId: issued.s });
  const photo = await photosRepo.insertPhoto(
    {
      kind: issued.kind,
      staffId: issued.s,
      key: issued.k,
      width: input.width,
      height: input.height,
      alt: input.alt,
      sortOrder,
      createdBy: actorOf(principal),
    },
    meta.now,
  );
  await auditLogRepo.appendAuditEntry(
    {
      actor: actorOf(principal),
      action: 'photo.create',
      entityType: 'photo',
      entityId: photo._id,
      before: null,
      after: { kind: photo.kind, staffId: photo.staffId, key: photo.key, alt: photo.alt },
      meta: { size: stored.size, contentType: stored.contentType },
      requestId: meta.requestId,
    },
    meta.now,
  );
  return toAdminPhotoView(photo);
}

export async function updatePhoto(
  principal: Principal,
  id: string,
  patch: { alt?: string | undefined; sortOrder?: number | undefined },
  meta: ServiceMeta,
): Promise<AdminPhotoView> {
  const before = await loadManaged(principal, id);
  const updated = await photosRepo.updatePhoto(id, patch);
  if (!updated) throw new AppError('NOT_FOUND', 'Photo was not found');
  await auditLogRepo.appendAuditEntry(
    {
      actor: actorOf(principal),
      action: 'photo.update',
      entityType: 'photo',
      entityId: id,
      before: { alt: before.alt, sortOrder: before.sortOrder },
      after: { alt: updated.alt, sortOrder: updated.sortOrder },
      meta: null,
      requestId: meta.requestId,
    },
    meta.now,
  );
  return toAdminPhotoView(updated);
}

/** Soft delete. The object itself is removed afterwards by `purgeDeletedPhotos`. */
export async function deletePhoto(
  principal: Principal,
  id: string,
  meta: ServiceMeta,
): Promise<void> {
  const photo = await loadManaged(principal, id);
  await photosRepo.softDeletePhoto(id, meta.now);
  await auditLogRepo.appendAuditEntry(
    {
      actor: actorOf(principal),
      action: 'photo.delete',
      entityType: 'photo',
      entityId: id,
      before: { key: photo.key },
      after: null,
      meta: null,
      requestId: meta.requestId,
    },
    meta.now,
  );
}

/** Removes the objects of deleted photos from storage. Safe to run repeatedly. */
export async function purgeDeletedPhotos(now: Date, limit = 50): Promise<number> {
  if (!storageEnabled()) return 0;
  const pending = await photosRepo.listUnpurged(limit);
  let purged = 0;
  for (const photo of pending) {
    await getStorage().delete(photo.key);
    await photosRepo.markPurged(photo._id, now);
    purged += 1;
  }
  return purged;
}

/**
 * Cloudinary only: removes assets in the folder that are over 24 hours old and that no photo record
 * points at (an upload whose confirm never came, or a record that was lost). Safe to run repeatedly.
 */
export async function sweepStorageOrphans(now: Date, limit = 50): Promise<number> {
  if (!storageEnabled()) return 0;
  const storage = getStorage();
  if (!storage.listOlderThan) return 0;
  const candidates = await storage.listOlderThan(
    new Date(now.getTime() - ORPHAN_AGE_MS),
    limit * 4,
  );
  if (candidates.length === 0) return 0;
  const known = new Set(await photosRepo.listAllKeys());
  let swept = 0;
  for (const key of candidates) {
    if (known.has(key) || swept >= limit) continue;
    await storage.delete(key);
    swept += 1;
  }
  return swept;
}

/** Removes objects behind upload URLs that were issued over an hour ago and never confirmed. */
export async function sweepAbandonedUploads(now: Date, limit = 50): Promise<number> {
  if (!storageEnabled()) return 0;
  const cutoff = new Date(now.getTime() - ABANDONED_UPLOAD_MS);
  const stale = await pendingUploadsRepo.listPendingUploadsBefore(cutoff, limit);
  for (const upload of stale) {
    await getStorage().delete(upload.key);
    await pendingUploadsRepo.deletePendingUploadByKey(upload.key);
  }
  return stale.length;
}

export async function listManagedPhotos(
  principal: Principal,
  query: { kind?: PhotoKind | undefined; staffId?: string | undefined },
): Promise<AdminPhotoView[]> {
  const filter: photosRepo.PhotoFilter =
    principal.role === 'owner'
      ? {
          ...(query.kind ? { kind: query.kind } : {}),
          ...(query.staffId ? { staffId: query.staffId } : {}),
        }
      : { kind: 'staff', staffId: principal.staffId ?? '' };
  if (!storageEnabled()) return [];
  return (await photosRepo.listPhotos(filter)).map(toAdminPhotoView);
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/** The first live staff photo per chair, keyed by staffId. */
export async function staffPhotoMap(): Promise<Map<string, PhotoView>> {
  const map = new Map<string, PhotoView>();
  // Without storage there is no public address to read a photo from, so every page shows its placeholder.
  if (!storageEnabled()) return map;
  const photos = await photosRepo.listPhotos({ kind: 'staff' });
  for (const p of photos) {
    if (p.staffId && !map.has(p.staffId)) map.set(p.staffId, toPhotoView(p));
  }
  return map;
}

export async function heroPhoto(): Promise<PhotoView | null> {
  if (!storageEnabled()) return null;
  const [first] = await photosRepo.listPhotos({ kind: 'hero' });
  return first ? toPhotoView(first) : null;
}

export async function galleryPage(query: {
  staff?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}): Promise<GalleryResponse> {
  const staff = await staffRepo.listStaff({ includeDeleted: true });
  const byId = new Map(staff.map((s) => [s._id, s]));
  let only: string | null = null;
  if (query.staff) {
    const wanted = query.staff.toLowerCase();
    const match = staff.find(
      (s) => !s.deletedAt && (s.slug === wanted || s.slugAliases.includes(wanted)),
    );
    if (!match) throw new AppError('NOT_FOUND', 'That chair was not found');
    only = match._id;
  }
  const all = storageEnabled()
    ? (await photosRepo.listPhotos({ kind: 'gallery' })).filter(
        (p) => !p.staffId || byId.get(p.staffId)?.deletedAt === null,
      )
    : [];
  const counts = new Map<string, number>();
  for (const p of all) if (p.staffId) counts.set(p.staffId, (counts.get(p.staffId) ?? 0) + 1);
  const filtered = only ? all.filter((p) => p.staffId === only) : all;
  const after = cursors.decode(query.cursor, isOrderCursor);
  const start = after ? filtered.findIndex((p) => p._id === after.i) + 1 : 0;
  const page = filtered.slice(start, start + query.limit);
  const last = page[page.length - 1];
  const toGallery = (p: PhotoDocument): GalleryPhoto => {
    const s = p.staffId ? byId.get(p.staffId) : undefined;
    return { ...toPhotoView(p), staff: s ? { id: s._id, name: s.name, slug: s.slug } : null };
  };
  return {
    photos: page.map(toGallery),
    nextCursor:
      last && start + query.limit < filtered.length
        ? cursors.encode({ s: last.sortOrder, i: last._id })
        : null,
    counts: staff
      .filter((s) => !s.deletedAt && s.showOnWebsite && (counts.get(s._id) ?? 0) > 0)
      .map((s) => ({ staffId: s._id, slug: s.slug, name: s.name, count: counts.get(s._id) ?? 0 })),
    total: filtered.length,
  };
}

function isOrderCursor(v: unknown): v is { s: number; i: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { s?: unknown }).s === 'number' &&
    typeof (v as { i?: unknown }).i === 'string'
  );
}
