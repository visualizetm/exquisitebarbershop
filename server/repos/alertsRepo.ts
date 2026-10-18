import { alertDocumentSchema, type AlertDocument } from '../../shared/schemas/alert';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export type AlertInput = Omit<
  AlertDocument,
  '_id' | 'createdAt' | 'updatedAt' | 'status' | 'resolvedAt' | 'resolvedByUserId'
>;

export async function insertAlert(
  input: AlertInput,
  now: Date,
  options?: RepoOptions,
): Promise<AlertDocument> {
  const doc = alertDocumentSchema.parse({
    _id: newId(),
    ...input,
    status: 'open',
    resolvedAt: null,
    resolvedByUserId: null,
    createdAt: now,
    updatedAt: now,
  });
  const col = await collection('alerts');
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

export async function findAlertById(
  id: string,
  options?: RepoOptions,
): Promise<AlertDocument | null> {
  const col = await collection('alerts');
  return col.findOne({ _id: id }, sessionOf(options));
}

/** Open alerts, oldest first, so the one that waited longest is on top. */
export async function listOpenAlerts(options?: RepoOptions): Promise<AlertDocument[]> {
  const col = await collection('alerts');
  return col.find({ status: 'open' }, sessionOf(options)).sort({ createdAt: 1 }).toArray();
}

/** Closes an alert. Returns false when it was already closed (a second tap does nothing). */
export async function closeAlert(
  id: string,
  status: 'resolved' | 'dismissed',
  userId: string | null,
  now: Date,
  options?: RepoOptions,
): Promise<boolean> {
  const col = await collection('alerts');
  const result = await col.updateOne(
    { _id: id, status: 'open' },
    { $set: { status, resolvedAt: now, resolvedByUserId: userId, updatedAt: now } },
    sessionOf(options),
  );
  return result.modifiedCount === 1;
}
