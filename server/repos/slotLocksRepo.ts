import { lockSlotStarts } from '../../shared/lib/time';
import { slotLockDocumentSchema, type SlotLockDocument } from '../../shared/schemas/slotLock';
import { collection } from '../db/collections';
import { AppError, isDuplicateKeyError } from '../lib/errors';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export interface LockHolder {
  holderType: SlotLockDocument['holderType'];
  holderId: string;
}

/**
 * Takes one lock per 15 minute block covering [start, end) for a chair. Must run
 * inside the transaction that creates the holder. A duplicate key on any block
 * aborts the whole insert and surfaces as SLOT_TAKEN.
 */
export async function acquireSlotLocks(
  staffId: string,
  range: { start: Date; end: Date },
  holder: LockHolder,
  now: Date,
  options?: RepoOptions,
): Promise<SlotLockDocument[]> {
  const starts = lockSlotStarts(range.start, range.end);
  if (starts.length === 0) throw new AppError('BAD_REQUEST', 'Cannot lock an empty time range');
  const docs = starts.map((slotStart) =>
    slotLockDocumentSchema.parse({
      _id: newId(),
      staffId,
      slotStart,
      holderType: holder.holderType,
      holderId: holder.holderId,
      createdAt: now,
    }),
  );
  const col = await collection('slotLocks');
  try {
    await col.insertMany(docs, { ordered: true, ...sessionOf(options) });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError('SLOT_TAKEN', 'That time is no longer available', {
        cause: error,
        context: { staffId, start: range.start.toISOString(), end: range.end.toISOString() },
      });
    }
    throw error;
  }
  return docs;
}

/** Releases every lock held by a booking or time block. Returns how many were removed. */
export async function releaseSlotLocks(holderId: string, options?: RepoOptions): Promise<number> {
  const col = await collection('slotLocks');
  const result = await col.deleteMany({ holderId }, sessionOf(options));
  return result.deletedCount;
}

export async function listSlotLocksForStaff(
  staffId: string,
  range: { start: Date; end: Date },
  options?: RepoOptions,
): Promise<SlotLockDocument[]> {
  const col = await collection('slotLocks');
  return col
    .find({ staffId, slotStart: { $gte: range.start, $lt: range.end } }, sessionOf(options))
    .sort({ slotStart: 1 })
    .toArray();
}

export async function listSlotLocksForHolder(
  holderId: string,
  options?: RepoOptions,
): Promise<SlotLockDocument[]> {
  const col = await collection('slotLocks');
  return col.find({ holderId }, sessionOf(options)).sort({ slotStart: 1 }).toArray();
}

/**
 * Locks only the blocks in [start, end) that nobody holds yet. Used for blocked
 * time that shares slots with bookings the owner chose to keep, and to re-lock a
 * blocked period once a booking inside it is cancelled. Returns how many it took.
 */
export async function acquireUnheldSlotLocks(
  staffId: string,
  range: { start: Date; end: Date },
  holder: LockHolder,
  now: Date,
  options?: RepoOptions,
): Promise<number> {
  const starts = lockSlotStarts(range.start, range.end);
  const first = starts[0];
  const last = starts[starts.length - 1];
  if (!first || !last) return 0;
  const col = await collection('slotLocks');
  const held = await col
    .find(
      { staffId, slotStart: { $gte: first, $lte: last } },
      { projection: { slotStart: 1 }, ...sessionOf(options) },
    )
    .toArray();
  const taken = new Set(held.map((l) => l.slotStart.getTime()));
  const docs = starts
    .filter((s) => !taken.has(s.getTime()))
    .map((slotStart) =>
      slotLockDocumentSchema.parse({
        _id: newId(),
        staffId,
        slotStart,
        holderType: holder.holderType,
        holderId: holder.holderId,
        createdAt: now,
      }),
    );
  if (docs.length === 0) return 0;
  await col.insertMany(docs, { ordered: true, ...sessionOf(options) });
  return docs.length;
}
