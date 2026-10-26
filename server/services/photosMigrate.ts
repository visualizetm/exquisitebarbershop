import { getEnv } from '../env';
import { photosRepo } from '../repos';
import { createCloudinaryDriver } from '../storage/cloudinary';
import { createLocalDriver } from '../storage/local';
import { createMongoDriver } from '../storage/mongo';
import { storePhotoBytes } from '../storage/serverUpload';
import type { StorageDriver } from '../storage/types';

export type MigrationSource = 'mongo' | 'local';

export interface MigrationSummary {
  dryRun: boolean;
  /** Photos still on the old storage when the run started. */
  found: number;
  /** Copied to Cloudinary and the record rewritten (or, in a dry run, would be). */
  migrated: number;
  /** Already on Cloudinary from an interrupted run: only the record was rewritten. */
  adopted: number;
  /** The old object could not be found. */
  missing: string[];
  failed: string[];
}

/** A key that is a file path on the old storage, not a Cloudinary public id. */
const FILE_KEY =
  /^(?:[a-z0-9][a-z0-9-]*\/)?(?:staff\/[0-9a-f]{24}|gallery|hero)\/([0-9a-f-]{36})\.webp$/;

function sourceDriver(from: MigrationSource): StorageDriver {
  const env = getEnv();
  const config = { baseUrl: env.APP_BASE_URL, secret: env.MANAGE_LINK_SECRET };
  return from === 'mongo' ? createMongoDriver(config) : createLocalDriver(config);
}

/**
 * Copies photos from the old storage (GridFS or the local disk) to Cloudinary and rewrites their
 * records. Safe to run again: a photo already moved is skipped, and one whose copy finished but whose
 * record did not is adopted. The old objects are left where they are. With `dryRun` nothing is
 * written anywhere.
 */
export async function migratePhotos(options: {
  from: MigrationSource;
  dryRun: boolean;
  log?: (line: string) => void;
}): Promise<MigrationSummary> {
  const log = options.log ?? (() => undefined);
  const env = getEnv();
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET ||
    !env.CLOUDINARY_FOLDER
  ) {
    throw new Error(
      'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET and CLOUDINARY_FOLDER first.',
    );
  }
  const target = createCloudinaryDriver({
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
    folder: env.CLOUDINARY_FOLDER,
  });
  const source = sourceDriver(options.from);
  const summary: MigrationSummary = {
    dryRun: options.dryRun,
    found: 0,
    migrated: 0,
    adopted: 0,
    missing: [],
    failed: [],
  };

  for (const photo of await photosRepo.listLiveForMigration()) {
    const uuid = FILE_KEY.exec(photo.key)?.[1];
    if (!uuid) continue;
    summary.found += 1;
    const newKey = `${env.CLOUDINARY_FOLDER}/${uuid}`;
    try {
      if (await target.head(newKey)) {
        if (!options.dryRun) await photosRepo.rekeyPhoto(photo._id, photo.key, newKey);
        summary.adopted += 1;
        log(
          `${photo.key}: already on Cloudinary, record ${options.dryRun ? 'would be' : ''} updated`,
        );
        continue;
      }
      const bytes = await source.get(photo.key);
      if (!bytes) {
        summary.missing.push(photo.key);
        log(`${photo.key}: not found in ${options.from}`);
        continue;
      }
      if (options.dryRun) {
        summary.migrated += 1;
        log(`${photo.key}: would copy ${String(bytes.length)} bytes to ${newKey}`);
        continue;
      }
      await storePhotoBytes(target, newKey, bytes, 'image/webp');
      const stored = await target.head(newKey);
      if (stored?.size !== bytes.length) throw new Error('The copy did not read back');
      await photosRepo.rekeyPhoto(photo._id, photo.key, newKey);
      summary.migrated += 1;
      log(`${photo.key}: copied to ${newKey}`);
    } catch (error) {
      summary.failed.push(photo.key);
      log(`${photo.key}: failed (${error instanceof Error ? error.message : 'unknown error'})`);
    }
  }
  return summary;
}
