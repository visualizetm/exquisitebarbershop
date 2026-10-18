import { staffPinDocumentSchema, type StaffPinDocument } from '../../shared/schemas/staffPin';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export async function findPinByStaff(
  staffId: string,
  options?: RepoOptions,
): Promise<StaffPinDocument | null> {
  const col = await collection('staffPins');
  return col.findOne({ staffId }, sessionOf(options));
}

export async function countPins(options?: RepoOptions): Promise<number> {
  const col = await collection('staffPins');
  return col.countDocuments({}, sessionOf(options));
}

/** Sets or replaces a barber's PIN. One document per barber, so a second call overwrites. */
export async function upsertPin(
  staffId: string,
  pinHash: string,
  now: Date,
  options?: RepoOptions,
): Promise<StaffPinDocument> {
  const col = await collection('staffPins');
  const after = await col.findOneAndUpdate(
    { staffId },
    {
      $set: { pinHash, pinSetAt: now, lastSignInAt: null, updatedAt: now },
      $setOnInsert: { _id: newId(), staffId, createdAt: now },
    },
    { upsert: true, returnDocument: 'after', ...sessionOf(options) },
  );
  if (!after) throw new Error('upsert returned no document');
  return staffPinDocumentSchema.parse(after);
}

export async function deletePin(staffId: string, options?: RepoOptions): Promise<boolean> {
  const col = await collection('staffPins');
  const result = await col.deleteOne({ staffId }, sessionOf(options));
  return result.deletedCount === 1;
}

export async function recordSignIn(
  staffId: string,
  now: Date,
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('staffPins');
  await col.updateOne({ staffId }, { $set: { lastSignInAt: now } }, sessionOf(options));
}
