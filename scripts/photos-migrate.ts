import 'dotenv/config';
import { closeMongoClient } from '../server/db/client';
import { migratePhotos } from '../server/services/photosMigrate';

/**
 * `npm run photos:migrate -- --from mongo --to cloudinary [--dry-run]`
 *
 * Copies the photos stored in MongoDB (GridFS) or on the local disk to Cloudinary and rewrites
 * their records. Run it with the production variables in .env (MONGODB_URI, MANAGE_LINK_SECRET and
 * the four CLOUDINARY variables). It is safe to run again, and --dry-run changes nothing.
 */
function option(name: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const from = option('from');
  const to = option('to');
  const dryRun = process.argv.includes('--dry-run');
  if ((from !== 'mongo' && from !== 'local') || to !== 'cloudinary') {
    throw new Error(
      'Usage: npm run photos:migrate -- --from mongo|local --to cloudinary [--dry-run]',
    );
  }
  const summary = await migratePhotos({
    from,
    dryRun,
    log: (line) => {
      console.log(line);
    },
  });
  console.log(
    `${dryRun ? 'Dry run: ' : ''}${String(summary.found)} on ${from}, ${String(summary.migrated)} ${dryRun ? 'to copy' : 'copied'}, ${String(summary.adopted)} already on Cloudinary, ${String(summary.missing.length)} missing, ${String(summary.failed.length)} failed.`,
  );
  if (summary.failed.length > 0 || summary.missing.length > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
