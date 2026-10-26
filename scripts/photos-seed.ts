import 'dotenv/config';
import { closeMongoClient } from '../server/db/client';
import { loadSeedPhotos } from '../server/services/seedPhotos';

/**
 * `npm run photos:seed`
 *
 * Loads the shop's real photos from seed/photos (manifest.json plus the WebP files) into the photo
 * storage of the database in .env, for a real launch. The showcase does this by itself on setup and
 * on Demo data, Reset. Run it with the production variables in .env (MONGODB_URI, MONGODB_DB_NAME,
 * MANAGE_LINK_SECRET, APP_BASE_URL, STORAGE_DRIVER and that driver's variables). Safe to run again:
 * photos already on record are kept, and files not in the folder yet are listed and skipped.
 * SEED_PHOTOS_DIR points it at another folder.
 */
async function main(): Promise<void> {
  const summary = await loadSeedPhotos(new Date());
  if (summary.skipped === 'storage-off') {
    console.log('STORAGE_DRIVER is none, so there is nowhere to put photos. Nothing was loaded.');
    return;
  }
  if (summary.skipped) {
    console.error(`No valid manifest.json in ${summary.dir}. Nothing was loaded.`);
    process.exitCode = 1;
    return;
  }
  const group = (label: string, files: string[]) => {
    console.log(`  ${label.padEnd(19)} ${String(files.length)}`);
    for (const file of files) console.log(`    ${file}`);
  };
  console.log(`Seed photos from ${summary.dir}:`);
  group('added:', summary.added);
  group('already there:', summary.existing);
  group('not in the folder:', summary.missing);
  group('failed:', summary.failed);
  if (summary.failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
