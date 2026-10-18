import {
  bootstrapRecordSchema,
  demoLockSchema,
  demoRecordSchema,
  type BootstrapRecord,
  type DemoLock,
  type DemoRecord,
} from '../../shared/schemas/systemState';
import { collection } from '../db/collections';
import { isDuplicateKeyError } from '../lib/errors';

export async function getBootstrapRecord(): Promise<BootstrapRecord | null> {
  const col = await collection('systemState');
  const doc = await col.findOne({ _id: 'bootstrap' });
  return doc ? bootstrapRecordSchema.parse(doc) : null;
}

export async function recordBootstrap(
  summary: BootstrapRecord['summary'],
  now: Date,
): Promise<BootstrapRecord> {
  const col = await collection('systemState');
  const previous = await getBootstrapRecord();
  const doc = bootstrapRecordSchema.parse({
    _id: 'bootstrap',
    completedAt: now,
    runs: (previous?.runs ?? 0) + 1,
    summary,
  });
  await col.replaceOne({ _id: 'bootstrap' }, doc, { upsert: true });
  return doc;
}

export async function getDemoRecord(): Promise<DemoRecord | null> {
  const col = await collection('systemState');
  const doc = await col.findOne({ _id: 'demo' });
  return doc ? demoRecordSchema.parse(doc) : null;
}

/** Marks the database as holding sample data, counting how often it was loaded. */
export async function recordDemoSeed(now: Date, previousRuns?: number): Promise<DemoRecord> {
  const col = await collection('systemState');
  const before = previousRuns ?? (await getDemoRecord())?.runs ?? 0;
  const doc = demoRecordSchema.parse({ _id: 'demo', seededAt: now, runs: before + 1 });
  await col.replaceOne({ _id: 'demo' }, doc, { upsert: true });
  return doc;
}

export async function clearDemoRecord(): Promise<void> {
  const col = await collection('systemState');
  await col.deleteOne({ _id: 'demo' });
}

/**
 * Takes the demo seeding lock. A unique _id makes the insert the atomic step; a lock
 * older than `staleMs` (a crashed cold start) is taken over with a compare and swap.
 */
export async function tryAcquireDemoLock(
  holder: string,
  now: Date,
  staleMs: number,
): Promise<boolean> {
  const col = await collection('systemState');
  const doc = demoLockSchema.parse({ _id: 'demoLock', lockedAt: now, holder });
  try {
    await col.insertOne(doc);
    return true;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  const existing = await col.findOne({ _id: 'demoLock' });
  if (!existing) return false;
  const lock: DemoLock = demoLockSchema.parse(existing);
  if (now.getTime() - lock.lockedAt.getTime() < staleMs) return false;
  const taken = await col.findOneAndUpdate(
    { _id: 'demoLock', lockedAt: lock.lockedAt },
    { $set: { lockedAt: now, holder } },
  );
  return taken !== null;
}

export async function releaseDemoLock(holder: string): Promise<void> {
  const col = await collection('systemState');
  await col.deleteOne({ _id: 'demoLock', holder });
}
