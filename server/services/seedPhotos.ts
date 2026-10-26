import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { Actor } from '../../shared/schemas/timeBlock';
import { getEnv } from '../env';
import { seedId, sha256Hex } from '../lib/ids';
import { logger } from '../lib/logger';
import { webpSize } from '../lib/webpSize';
import { auditLogRepo, photosRepo } from '../repos';
import { getStorage, newPhotoKey, storageEnabled } from '../storage';
import { storePhotoBytes } from '../storage/serverUpload';

const SYSTEM: Actor = { type: 'system', userId: null, staffId: null };

/** One photo in `seed/photos/manifest.json`. Extra keys (such as `source`) are kept out of the record. */
export const seedPhotoEntrySchema = z.object({
  file: z.string().regex(/^[a-z0-9][a-z0-9-]*\.webp$/, 'A lowercase .webp file name'),
  kind: z.enum(['hero', 'gallery']),
  alt: z.string().trim().min(1).max(200),
  home: z.boolean().optional(),
  sortOrder: z.int().min(0),
});
export const seedPhotoManifestSchema = z.object({
  photos: z.array(seedPhotoEntrySchema).max(200),
});
export type SeedPhotoEntry = z.infer<typeof seedPhotoEntrySchema>;

export interface SeedPhotosSummary {
  dir: string;
  /** Stored by this run. */
  added: string[];
  /** Already on record from an earlier run, kept as they are (also when the owner deleted them). */
  existing: string[];
  /** In the manifest, but the file is not in the folder yet. */
  missing: string[];
  /** The file is there but could not be stored: not a WebP, or the storage refused it. */
  failed: string[];
  /** Why nothing was looked at: storage is off, or the manifest is missing or not valid. */
  skipped: 'storage-off' | 'no-manifest' | 'bad-manifest' | null;
}

/** The folder the photos and manifest are read from: SEED_PHOTOS_DIR, else seed/photos. */
export function seedPhotosDir(): string {
  return resolve(process.cwd(), process.env.SEED_PHOTOS_DIR ?? 'seed/photos');
}

/** The record id of a seed photo: the same for a file name on every run, so a run never duplicates. */
export function seedPhotoId(file: string): string {
  return seedId('photo', file);
}

/**
 * The object key's uuid. It is derived from the database, the file name and the bytes: running again
 * after a crash rewrites the same object, two deployments sharing a bucket never share an object, and
 * a file replaced under the same name gets a new address, so the year long media cache never serves
 * the old picture.
 */
function seedPhotoUuid(file: string, bytes: Uint8Array): string {
  const h = sha256Hex(`seed-photo:${getEnv().MONGODB_DB_NAME}:${file}:${sha256Hex(bytes)}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function readManifest(
  dir: string,
): Promise<SeedPhotoEntry[] | 'no-manifest' | 'bad-manifest'> {
  let text: string;
  try {
    text = await readFile(join(dir, 'manifest.json'), 'utf8');
  } catch {
    return 'no-manifest';
  }
  try {
    const parsed = seedPhotoManifestSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.photos : 'bad-manifest';
  } catch {
    return 'bad-manifest';
  }
}

async function readOptional(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/**
 * Loads the shop's real photos from `seed/photos` (manifest.json plus the WebP files) through the
 * active storage driver, as normal photo records: kind, alt, sort order and the Home pick from the
 * manifest, no chair credited, width and height from the file header. Safe to run any number of
 * times: a photo already on record is left alone, even one the owner has since deleted, and the hero
 * is only added while the shop has no home photo. A manifest
 * entry whose file is not there yet is skipped, with one warning that names every missing file; this
 * never throws for a missing file, so demo setup always finishes.
 */
export async function loadSeedPhotos(
  now: Date,
  options: { dir?: string; requestId?: string | null } = {},
): Promise<SeedPhotosSummary> {
  const dir = options.dir ?? seedPhotosDir();
  const summary: SeedPhotosSummary = {
    dir,
    added: [],
    existing: [],
    missing: [],
    failed: [],
    skipped: null,
  };
  if (!storageEnabled()) {
    summary.skipped = 'storage-off';
    return summary;
  }
  const manifest = await readManifest(dir);
  if (typeof manifest === 'string') {
    summary.skipped = manifest;
    logger.warn(
      manifest === 'no-manifest'
        ? 'seed photos: no manifest.json, nothing loaded'
        : 'seed photos: manifest.json is not valid, nothing loaded',
      { dir },
    );
    return summary;
  }

  const storage = getStorage();
  for (const entry of manifest) {
    const id = seedPhotoId(entry.file);
    // A home photo the owner already chose stays: the seed's hero only fills an empty slot.
    const heroTaken =
      entry.kind === 'hero' && (await photosRepo.listPhotos({ kind: 'hero' })).length > 0;
    if (heroTaken || (await photosRepo.findPhotoById(id))) {
      summary.existing.push(entry.file);
      continue;
    }
    const bytes = await readOptional(join(dir, entry.file));
    if (!bytes) {
      summary.missing.push(entry.file);
      continue;
    }
    const size = webpSize(bytes);
    if (!size) {
      summary.failed.push(entry.file);
      logger.warn('seed photos: not a WebP file, skipped', { file: entry.file });
      continue;
    }
    try {
      const key = newPhotoKey(entry.kind, null, seedPhotoUuid(entry.file, bytes));
      await storePhotoBytes(storage, key, bytes, 'image/webp');
      await photosRepo.insertPhoto(
        {
          kind: entry.kind,
          staffId: null,
          key,
          width: size.width,
          height: size.height,
          alt: entry.alt,
          sortOrder: entry.sortOrder,
          ...(entry.home ? { home: true } : {}),
          createdBy: SYSTEM,
        },
        now,
        { id },
      );
      summary.added.push(entry.file);
    } catch (error) {
      summary.failed.push(entry.file);
      logger.warn('seed photos: could not store a photo', {
        file: entry.file,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  if (summary.missing.length > 0) {
    logger.warn(
      `seed photos: ${String(summary.missing.length)} of ${String(manifest.length)} files are not in the folder yet, skipped`,
      { dir, missing: summary.missing },
    );
  }
  if (summary.added.length > 0) {
    await auditLogRepo.appendAuditEntry(
      {
        actor: SYSTEM,
        action: 'photo.seed',
        entityType: 'photo',
        entityId: 'seed',
        before: null,
        after: { added: summary.added },
        meta: { missing: summary.missing.length, failed: summary.failed.length },
        requestId: options.requestId ?? null,
      },
      now,
    );
  }
  return summary;
}
