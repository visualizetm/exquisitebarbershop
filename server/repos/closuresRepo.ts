import {
  closureDocumentSchema,
  closureInputSchema,
  type ClosureDocument,
  type ClosureInput,
} from '../../shared/schemas/closure';
import { collection } from '../db/collections';
import { AppError, isDuplicateKeyError } from '../lib/errors';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export async function insertClosure(
  input: ClosureInput,
  now: Date,
  options?: RepoOptions,
): Promise<ClosureDocument> {
  const parsed = closureInputSchema.parse(input);
  const doc = closureDocumentSchema.parse({ _id: newId(), ...parsed, createdAt: now });
  const col = await collection('closures');
  try {
    await col.insertOne(doc, sessionOf(options));
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError('CONFLICT', `There is already an exception for ${doc.date}`, {
        cause: error,
      });
    }
    throw error;
  }
  return doc;
}

/** Replaces the exception for a date, or creates it. */
export async function upsertClosure(
  input: ClosureInput,
  now: Date,
  options?: RepoOptions,
): Promise<ClosureDocument> {
  const parsed = closureInputSchema.parse(input);
  const col = await collection('closures');
  const updated = await col.findOneAndUpdate(
    { date: parsed.date },
    {
      $set: { kind: parsed.kind, intervals: parsed.intervals, label: parsed.label },
      $setOnInsert: { _id: newId(), date: parsed.date, createdAt: now },
    },
    { upsert: true, returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated) throw new Error('upsert returned no document');
  return updated;
}

export async function findClosureByDate(
  date: string,
  options?: RepoOptions,
): Promise<ClosureDocument | null> {
  const col = await collection('closures');
  return col.findOne({ date }, sessionOf(options));
}

/** Inclusive date range, ISO strings compare correctly as strings. */
export async function listClosuresBetween(
  fromDate: string,
  toDate: string,
  options?: RepoOptions,
): Promise<ClosureDocument[]> {
  const col = await collection('closures');
  return col
    .find({ date: { $gte: fromDate, $lte: toDate } }, sessionOf(options))
    .sort({ date: 1 })
    .toArray();
}

export async function deleteClosure(id: string, options?: RepoOptions): Promise<boolean> {
  const col = await collection('closures');
  const result = await col.deleteOne({ _id: id }, sessionOf(options));
  return result.deletedCount === 1;
}
