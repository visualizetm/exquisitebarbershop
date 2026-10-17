import {
  pendingUploadDocumentSchema,
  type PendingUploadDocument,
} from '../../shared/schemas/pendingUpload';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export async function insertPendingUpload(
  input: Omit<PendingUploadDocument, '_id' | 'issuedAt'>,
  now: Date,
  options?: RepoOptions,
): Promise<PendingUploadDocument> {
  const doc = pendingUploadDocumentSchema.parse({ _id: newId(), ...input, issuedAt: now });
  const col = await collection('pendingUploads');
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

export async function deletePendingUploadByKey(key: string, options?: RepoOptions): Promise<void> {
  const col = await collection('pendingUploads');
  await col.deleteOne({ key }, sessionOf(options));
}

/** Uploads issued before `cutoff` that were never confirmed, oldest first. */
export async function listPendingUploadsBefore(
  cutoff: Date,
  limit: number,
  options?: RepoOptions,
): Promise<PendingUploadDocument[]> {
  const col = await collection('pendingUploads');
  return col
    .find({ issuedAt: { $lt: cutoff } }, sessionOf(options))
    .sort({ issuedAt: 1 })
    .limit(limit)
    .toArray();
}
