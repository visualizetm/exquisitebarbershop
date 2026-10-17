import { timeBlockDocumentSchema, type TimeBlockDocument } from '../../shared/schemas/timeBlock';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export type TimeBlockInput = Omit<TimeBlockDocument, '_id' | 'createdAt'>;

export async function insertTimeBlock(
  input: TimeBlockInput,
  now: Date,
  options?: RepoOptions & { id?: string },
): Promise<TimeBlockDocument> {
  const doc = timeBlockDocumentSchema.parse({
    _id: options?.id ?? newId(),
    ...input,
    createdAt: now,
  });
  const col = await collection('timeBlocks');
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

export async function findTimeBlockById(
  id: string,
  options?: RepoOptions,
): Promise<TimeBlockDocument | null> {
  const col = await collection('timeBlocks');
  return col.findOne({ _id: id }, sessionOf(options));
}

/** Blocks for one staff member overlapping [start, end). */
export async function listTimeBlocksForStaff(
  staffId: string,
  range: { start: Date; end: Date },
  options?: RepoOptions,
): Promise<TimeBlockDocument[]> {
  const col = await collection('timeBlocks');
  return col
    .find({ staffId, startAt: { $lt: range.end }, endAt: { $gt: range.start } }, sessionOf(options))
    .sort({ startAt: 1 })
    .toArray();
}

/** Blocks for everyone overlapping [start, end). */
export async function listTimeBlocksBetween(
  range: { start: Date; end: Date },
  options?: RepoOptions,
): Promise<TimeBlockDocument[]> {
  const col = await collection('timeBlocks');
  return col
    .find({ startAt: { $lt: range.end }, endAt: { $gt: range.start } }, sessionOf(options))
    .sort({ startAt: 1 })
    .toArray();
}

export async function deleteTimeBlock(id: string, options?: RepoOptions): Promise<boolean> {
  const col = await collection('timeBlocks');
  const result = await col.deleteOne({ _id: id }, sessionOf(options));
  return result.deletedCount === 1;
}

/** Blocks that have not ended yet, for every chair or some. */
export async function listTimeBlocksEndingAfter(
  instant: Date,
  staffIds: readonly string[] | null,
  options?: RepoOptions,
): Promise<TimeBlockDocument[]> {
  const col = await collection('timeBlocks');
  const query: Record<string, unknown> = { endAt: { $gt: instant } };
  if (staffIds) query.staffId = { $in: [...staffIds] };
  return col.find(query, sessionOf(options)).sort({ startAt: 1 }).toArray();
}
