import { getEnv } from '../env';
import { createLocalDriver } from './local';
import { createR2Driver } from './r2';
import type { StorageDriver } from './types';

let cached: StorageDriver | null = null;

/** The storage driver for this process, chosen once from STORAGE_DRIVER. */
export function getStorage(): StorageDriver {
  if (cached) return cached;
  const env = getEnv();
  if (env.STORAGE_DRIVER === 'r2') {
    cached = createR2Driver({
      accountId: env.R2_ACCOUNT_ID ?? '',
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
      bucket: env.R2_BUCKET ?? '',
      publicBaseUrl: env.R2_PUBLIC_BASE_URL ?? '',
    });
  } else {
    cached = createLocalDriver({ baseUrl: env.APP_BASE_URL, secret: env.MANAGE_LINK_SECRET });
  }
  return cached;
}

/** The folder every generated key sits under (R2_KEY_PREFIX), or nothing. */
export function keyPrefix(): string {
  return getEnv().R2_KEY_PREFIX ?? '';
}

/** Test helper: forget the driver so the next call re-reads the environment. */
export function resetStorageCache(): void {
  cached = null;
}

export type { PresignedUpload, StorageDriver, StoredObject } from './types';
