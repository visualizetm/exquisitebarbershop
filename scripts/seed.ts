import 'dotenv/config';
import { closeMongoClient, getDb } from '../server/db/client';
import { runSeed } from '../server/services/seedService';

async function main(): Promise<void> {
  const db = await getDb();
  const summary = await runSeed(db, new Date(), {
    ownerPassword: process.env.SEED_OWNER_PASSWORD ?? null,
    ownerEmail: process.env.SEED_OWNER_EMAIL ?? null,
  });
  console.log(`Seeded ${db.databaseName}:`);
  console.log(`  shop settings created: ${summary.settingsCreated}`);
  console.log(`  shop hours created:    ${summary.shopHoursCreated}`);
  console.log(`  services created:      ${summary.servicesCreated}`);
  console.log(`  staff created:         ${summary.staffCreated}`);
  console.log(`  staff hours created:   ${summary.staffHoursCreated}`);
  console.log(`  owner login:           ${summary.ownerLogin}`);
  if (summary.ownerLogin === 'skipped') {
    console.log('  (set SEED_OWNER_PASSWORD to create the owner login)');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
