import { getEnv } from '../env';
import { PHOTO_MAX_BYTES } from '../../shared/schemas/photo';
import { AppError } from '../lib/errors';
import { createCloudinaryDriver, CLOUDINARY_MAX_BYTES } from './cloudinary';
import { createLocalDriver } from './local';
import { createMongoDriver, MONGO_MAX_BYTES } from './mongo';
import { createR2Driver } from './r2';
import type { StorageDriver } from './types';

let cached: StorageDriver | null = null;

/** False while STORAGE_DRIVER is none: no photos, no uploads, no daily backups. */
export function storageEnabled(): boolean {
  return getEnv().STORAGE_DRIVER !== 'none';
}

/**
 * True when the daily job can write backups: GridFS photos live in the database itself and Cloudinary
 * holds images only, so neither has a place to put the export.
 */
export function backupsEnabled(): boolean {
  const driver = getEnv().STORAGE_DRIVER;
  return driver === 'r2' || driver === 'local';
}

/** The largest photo the driver accepts after the browser resize. */
export function maxUploadBytes(): number {
  const driver = getEnv().STORAGE_DRIVER;
  if (driver === 'mongo') return MONGO_MAX_BYTES;
  return driver === 'cloudinary' ? CLOUDINARY_MAX_BYTES : PHOTO_MAX_BYTES;
}

/** Throws the 503 every upload route answers while photo storage is not set up. */
export function assertStorageEnabled(): void {
  if (!storageEnabled()) {
    throw new AppError(
      'STORAGE_DISABLED',
      'Photo storage is not set up yet. Photos can be added once it is connected.',
    );
  }
}

/** The storage driver for this process, chosen once from STORAGE_DRIVER. */
export function getStorage(): StorageDriver {
  if (cached) return cached;
  assertStorageEnabled();
  const env = getEnv();
  if (env.STORAGE_DRIVER === 'r2') {
    cached = createR2Driver({
      accountId: env.R2_ACCOUNT_ID ?? '',
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
      bucket: env.R2_BUCKET ?? '',
      publicBaseUrl: env.R2_PUBLIC_BASE_URL ?? '',
    });
  } else if (env.STORAGE_DRIVER === 'cloudinary') {
    cached = createCloudinaryDriver({
      cloudName: env.CLOUDINARY_CLOUD_NAME ?? '',
      apiKey: env.CLOUDINARY_API_KEY ?? '',
      apiSecret: env.CLOUDINARY_API_SECRET ?? '',
      folder: env.CLOUDINARY_FOLDER ?? '',
    });
  } else if (env.STORAGE_DRIVER === 'mongo') {
    cached = createMongoDriver({ baseUrl: env.APP_BASE_URL, secret: env.MANAGE_LINK_SECRET });
  } else {
    cached = createLocalDriver({ baseUrl: env.APP_BASE_URL, secret: env.MANAGE_LINK_SECRET });
  }
  return cached;
}

/** The folder every generated key sits under (R2_KEY_PREFIX), or nothing. */
export function keyPrefix(): string {
  return getEnv().R2_KEY_PREFIX ?? '';
}

/**
 * The key for a new photo. Files are `staff/<id>/<uuid>.webp`, `gallery/<uuid>.webp` or
 * `hero/<uuid>.webp`; on Cloudinary the key is the public id, the folder and the uuid.
 */
export function newPhotoKey(
  kind: 'staff' | 'gallery' | 'hero',
  staffId: string | null,
  uuid: string,
) {
  const env = getEnv();
  if (env.STORAGE_DRIVER === 'cloudinary') return `${env.CLOUDINARY_FOLDER ?? ''}/${uuid}`;
  const tail = kind === 'staff' ? `staff/${staffId ?? ''}/${uuid}.webp` : `${kind}/${uuid}.webp`;
  return `${keyPrefix()}${tail}`;
}

/** Test helper: forget the driver so the next call re-reads the environment. */
export function resetStorageCache(): void {
  cached = null;
}

export type { PresignedUpload, StorageDriver, StoredObject } from './types';
