import 'dotenv/config';
import { closeMongoClient, getDb } from '../server/db/client';
import { ensureIndexes, INDEXES } from '../server/db/indexes';

async function main(): Promise<void> {
  const db = await getDb();
  const { created } = await ensureIndexes(db);
  console.log(`Ensured ${created.length} indexes on ${db.databaseName}:`);
  for (const name of created) console.log(`  ${name}`);
  if (created.length !== INDEXES.length) throw new Error('Index count mismatch');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
