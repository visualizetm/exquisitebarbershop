import 'dotenv/config';
import { closeMongoClient } from '../server/db/client';
import { restoreBackup } from '../server/services/backup';

/**
 * `npm run restore -- --date=YYYY-MM-DD --to=<db name> [--force]`
 * Restores one day's backup into another database. The live database name is
 * refused without --force.
 */
async function main(): Promise<void> {
  const arg = (name: string) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const date = arg('date');
  const to = arg('to');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !to) {
    console.error('Usage: npm run restore -- --date=YYYY-MM-DD --to=<db name> [--force]');
    process.exitCode = 2;
    return;
  }
  const result = await restoreBackup({
    date,
    toDbName: to,
    force: process.argv.includes('--force'),
  });
  console.log(`Restored the ${result.date} backup into ${result.database}:`);
  for (const c of result.collections) console.log(`  ${c.name}: ${c.restored}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
