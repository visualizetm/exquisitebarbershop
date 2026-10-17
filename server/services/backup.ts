import { gunzipSync, gzipSync } from 'node:zlib';
import { BSON, type Document } from 'mongodb';
import { getDb, getMongoClient } from '../db/client';
import { COLLECTIONS, type CollectionName } from '../db/indexes';
import { getBuildSha, getEnv } from '../env';
import { logger } from '../lib/logger';
import { getStorage, keyPrefix } from '../storage';

/** Session tokens, rate limit windows and idempotency keys are short lived and never restored. */
const EXCLUDED: ReadonlySet<CollectionName> = new Set([
  'sessions',
  'rateLimits',
  'idempotencyKeys',
]);
export const BACKUP_COLLECTIONS: readonly CollectionName[] = Object.values(COLLECTIONS).filter(
  (name) => !EXCLUDED.has(name),
);
export const BACKUP_KEEP_DAYS = 30;

export interface BackupManifest {
  date: string;
  createdAt: string;
  database: string;
  buildSha: string;
  collections: { name: string; count: number; bytes: number }[];
}

export function backupDateOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function folder(date: string): string {
  return `${keyPrefix()}_backups/${date}`;
}

/** Exports every business collection as gzipped NDJSON under _backups/YYYY-MM-DD/. Safe to rerun. */
export async function runBackup(now: Date = new Date()): Promise<BackupManifest> {
  const db = await getDb();
  const storage = getStorage();
  const date = backupDateOf(now);
  const manifest: BackupManifest = {
    date,
    createdAt: now.toISOString(),
    database: db.databaseName,
    buildSha: getBuildSha(),
    collections: [],
  };
  for (const name of BACKUP_COLLECTIONS) {
    const docs = await db.collection(name).find({}).toArray();
    // Canonical EJSON keeps Dates and ObjectIds exact, so a restore is byte for byte.
    const ndjson = docs.map((d) => BSON.EJSON.stringify(d, { relaxed: false })).join('\n');
    const bytes = gzipSync(Buffer.from(ndjson, 'utf8'));
    await storage.put(`${folder(date)}/${name}.ndjson.gz`, bytes, 'application/gzip');
    manifest.collections.push({ name, count: docs.length, bytes: bytes.length });
  }
  await storage.put(
    `${folder(date)}/manifest.json`,
    Buffer.from(JSON.stringify(manifest, null, 2)),
    'application/json',
  );
  logger.info('backup written', {
    date,
    collections: manifest.collections.length,
    documents: manifest.collections.reduce((n, c) => n + c.count, 0),
  });
  return manifest;
}

/**
 * Deletes backups older than BACKUP_KEEP_DAYS. Keys are deterministic, so no
 * listing is needed: the ten days just past the window are removed each run.
 */
export async function pruneBackups(now: Date = new Date()): Promise<number> {
  const storage = getStorage();
  let removed = 0;
  for (let back = BACKUP_KEEP_DAYS + 1; back <= BACKUP_KEEP_DAYS + 10; back += 1) {
    const date = backupDateOf(new Date(now.getTime() - back * 24 * 60 * 60_000));
    const manifestKey = `${folder(date)}/manifest.json`;
    if (!(await storage.head(manifestKey))) continue;
    for (const name of BACKUP_COLLECTIONS)
      await storage.delete(`${folder(date)}/${name}.ndjson.gz`);
    await storage.delete(manifestKey);
    removed += 1;
  }
  return removed;
}

export async function readManifest(date: string): Promise<BackupManifest | null> {
  const bytes = await getStorage().get(`${folder(date)}/manifest.json`);
  return bytes ? (JSON.parse(Buffer.from(bytes).toString('utf8')) as BackupManifest) : null;
}

export interface RestoreResult {
  date: string;
  database: string;
  collections: { name: string; restored: number }[];
}

/**
 * Restores one day's backup into a database. The live database is refused
 * unless `force` is set; every target collection is replaced whole.
 */
export async function restoreBackup(input: {
  date: string;
  toDbName: string;
  force?: boolean;
}): Promise<RestoreResult> {
  if (input.toDbName === getEnv().MONGODB_DB_NAME && !input.force) {
    throw new Error(
      `Refusing to restore over the live database ${input.toDbName}. Pass --force to do it anyway.`,
    );
  }
  const manifest = await readManifest(input.date);
  if (!manifest) throw new Error(`No backup for ${input.date}`);
  const client = await getMongoClient();
  const target = client.db(input.toDbName);
  const storage = getStorage();
  const result: RestoreResult = { date: input.date, database: input.toDbName, collections: [] };
  for (const entry of manifest.collections) {
    const bytes = await storage.get(`${folder(input.date)}/${entry.name}.ndjson.gz`);
    if (!bytes) throw new Error(`Backup file for ${entry.name} is missing`);
    const text = gunzipSync(Buffer.from(bytes)).toString('utf8');
    const docs = text
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => BSON.EJSON.parse(line) as Document);
    await target
      .collection(entry.name)
      .drop()
      .catch(() => undefined);
    if (docs.length > 0) await target.collection(entry.name).insertMany(docs, { ordered: false });
    result.collections.push({ name: entry.name, restored: docs.length });
  }
  return result;
}
