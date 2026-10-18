import 'dotenv/config';
import { closeMongoClient } from '../server/db/client';
import { clearDemoData } from '../server/services/demo';

/**
 * `npm run demo:clear`: leaves the showcase. Empties a database the demo seeded (and
 * refuses any other), so /setup can then create the real shop. The same as the
 * "Clear demo data" button on /setup, for a computer with the production variables in .env.
 */
async function main(): Promise<void> {
  await clearDemoData();
  console.log('Demo data cleared. Turn DEMO_MODE off, then run setup with the real owner login.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
