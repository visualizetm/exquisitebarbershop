import { collection } from '../db/collections';
import { sessionOf, type RepoOptions } from './types';

/**
 * Bumps the guard of each chair inside the caller's transaction. Any two
 * transactions that bump the same chair write the same document, and MongoDB
 * retries one of them on a fresh snapshot. Booking a chair and changing when it
 * works both bump it, so neither can act on a stale view of the other.
 */
export async function bumpScheduleGuards(
  staffIds: readonly string[],
  now: Date,
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('scheduleGuards');
  for (const staffId of [...new Set(staffIds)].sort()) {
    await col.updateOne(
      { _id: staffId },
      { $inc: { version: 1 }, $set: { updatedAt: now } },
      { upsert: true, ...sessionOf(options) },
    );
  }
}

export async function getScheduleGuardVersion(
  staffId: string,
  options?: RepoOptions,
): Promise<number> {
  const col = await collection('scheduleGuards');
  return (await col.findOne({ _id: staffId }, sessionOf(options)))?.version ?? 0;
}
