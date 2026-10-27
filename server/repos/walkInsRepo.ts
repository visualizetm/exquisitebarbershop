import { walkInDocumentSchema, type WalkInDocument } from '../../shared/schemas/walkIn';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export async function insertWalkIn(
  input: Omit<WalkInDocument, '_id' | 'position' | 'createdAt'>,
  now: Date,
  options?: RepoOptions,
): Promise<WalkInDocument> {
  const col = await collection('walkIns');
  const last = await col
    .find({ status: 'waiting' }, { ...sessionOf(options), sort: { position: -1 }, limit: 1 })
    .toArray();
  const doc = walkInDocumentSchema.parse({
    ...input,
    _id: newId(),
    position: (last[0]?.position ?? -1) + 1,
    createdAt: now,
  });
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

export async function findWalkInById(
  id: string,
  options?: RepoOptions,
): Promise<WalkInDocument | null> {
  const col = await collection('walkIns');
  return col.findOne({ _id: id }, sessionOf(options));
}

/** Everyone waiting, in line order. */
export async function listWaiting(options?: RepoOptions): Promise<WalkInDocument[]> {
  const col = await collection('walkIns');
  return col
    .find({ status: 'waiting' }, { ...sessionOf(options), sort: { position: 1, createdAt: 1 } })
    .toArray();
}

/** Today's whole line, waiting first, then seated and left, for the day view. */
export async function listSince(since: Date, options?: RepoOptions): Promise<WalkInDocument[]> {
  const col = await collection('walkIns');
  return col
    .find(
      { $or: [{ status: 'waiting' }, { createdAt: { $gte: since } }] },
      { ...sessionOf(options), sort: { position: 1, createdAt: 1 } },
    )
    .toArray();
}

export async function updateWalkIn(
  id: string,
  patch: Partial<Pick<WalkInDocument, 'staffId' | 'serviceIds' | 'position' | 'note'>>,
  options?: RepoOptions,
): Promise<WalkInDocument | null> {
  const col = await collection('walkIns');
  return col.findOneAndUpdate(
    { _id: id, status: 'waiting' },
    { $set: patch },
    { returnDocument: 'after', ...sessionOf(options) },
  );
}

/**
 * Claims a waiting entry for seating: only one caller wins, so two taps on Seat can never make
 * two bookings. The booking id is written afterwards, and a failed seat hands the entry back.
 */
export async function claimForSeating(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<WalkInDocument | null> {
  const col = await collection('walkIns');
  return col.findOneAndUpdate(
    { _id: id, status: 'waiting' },
    { $set: { status: 'seated', seatedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
}

export async function finishSeating(
  id: string,
  bookingId: string,
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('walkIns');
  await col.updateOne({ _id: id }, { $set: { bookingId } }, sessionOf(options));
}

export async function releaseSeating(id: string, options?: RepoOptions): Promise<void> {
  const col = await collection('walkIns');
  await col.updateOne(
    { _id: id, status: 'seated', bookingId: null },
    { $set: { status: 'waiting', seatedAt: null } },
    sessionOf(options),
  );
}

export async function markLeft(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<WalkInDocument | null> {
  const col = await collection('walkIns');
  return col.findOneAndUpdate(
    { _id: id, status: 'waiting' },
    { $set: { status: 'left', leftAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
}
