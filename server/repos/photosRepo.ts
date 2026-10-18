import type { Filter } from 'mongodb';
import {
  photoDocumentSchema,
  type PhotoDocument,
  type PhotoKind,
} from '../../shared/schemas/photo';
import type { Actor } from '../../shared/schemas/timeBlock';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export interface PhotoInput {
  kind: PhotoKind;
  staffId: string | null;
  key: string;
  width: number;
  height: number;
  alt: string;
  sortOrder: number;
  createdBy: Actor;
}

export async function insertPhoto(
  input: PhotoInput,
  now: Date,
  options?: RepoOptions,
): Promise<PhotoDocument> {
  const doc = photoDocumentSchema.parse({
    _id: newId(),
    ...input,
    createdAt: now,
    deletedAt: null,
    purgedAt: null,
  });
  const col = await collection('photos');
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

export async function findPhotoById(
  id: string,
  options?: RepoOptions,
): Promise<PhotoDocument | null> {
  const col = await collection('photos');
  return col.findOne({ _id: id }, sessionOf(options));
}

export interface PhotoFilter {
  kind?: PhotoKind;
  staffId?: string | null;
}

/** Live photos in display order: sortOrder, then newest first. */
export async function listPhotos(
  filter: PhotoFilter,
  options?: RepoOptions,
): Promise<PhotoDocument[]> {
  const col = await collection('photos');
  const query: Filter<PhotoDocument> = { deletedAt: null };
  if (filter.kind) query.kind = filter.kind;
  if (filter.staffId !== undefined) query.staffId = filter.staffId;
  return col
    .find(query, sessionOf(options))
    .sort({ sortOrder: 1, createdAt: -1, _id: 1 })
    .toArray();
}

/** The next sortOrder for a kind (and chair), so new photos land at the end. */
export async function nextSortOrder(filter: PhotoFilter, options?: RepoOptions): Promise<number> {
  const col = await collection('photos');
  const query: Filter<PhotoDocument> = { deletedAt: null };
  if (filter.kind) query.kind = filter.kind;
  if (filter.staffId !== undefined) query.staffId = filter.staffId;
  const last = await col.find(query, sessionOf(options)).sort({ sortOrder: -1 }).limit(1).toArray();
  return (last[0]?.sortOrder ?? -1) + 1;
}

export async function updatePhoto(
  id: string,
  patch: {
    alt?: string | undefined;
    sortOrder?: number | undefined;
    staffId?: string | null | undefined;
  },
  options?: RepoOptions,
): Promise<PhotoDocument | null> {
  const col = await collection('photos');
  const $set: Partial<PhotoDocument> = {};
  if (patch.alt !== undefined) $set.alt = patch.alt;
  if (patch.sortOrder !== undefined) $set.sortOrder = patch.sortOrder;
  if (patch.staffId !== undefined) $set.staffId = patch.staffId;
  return col.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set },
    { returnDocument: 'after', ...sessionOf(options) },
  );
}

export async function softDeletePhoto(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<PhotoDocument | null> {
  const col = await collection('photos');
  return col.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { deletedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
}

/** Deleted photos whose object has not been removed from storage yet. */
export async function listUnpurged(limit: number, options?: RepoOptions): Promise<PhotoDocument[]> {
  const col = await collection('photos');
  return col
    .find({ deletedAt: { $ne: null }, purgedAt: null }, sessionOf(options))
    .limit(limit)
    .toArray();
}

export async function markPurged(id: string, now: Date, options?: RepoOptions): Promise<void> {
  const col = await collection('photos');
  await col.updateOne({ _id: id }, { $set: { purgedAt: now } }, sessionOf(options));
}

/** Every photo key on record, deleted or not: the orphan sweep keeps what a record still points at. */
export async function listAllKeys(options?: RepoOptions): Promise<string[]> {
  const col = await collection('photos');
  const docs = await col.find({}, { projection: { key: 1 }, ...sessionOf(options) }).toArray();
  return docs.map((d) => d.key);
}

/** Points a photo record at a new object key (the storage migration). Only if it still has the old one. */
export async function rekeyPhoto(
  id: string,
  from: string,
  to: string,
  options?: RepoOptions,
): Promise<boolean> {
  const col = await collection('photos');
  const result = await col.updateOne(
    { _id: id, key: from },
    { $set: { key: to } },
    sessionOf(options),
  );
  return result.modifiedCount === 1;
}

/** Photos whose object is not yet purged, newest last: what a storage migration walks. */
export async function listLiveForMigration(options?: RepoOptions): Promise<PhotoDocument[]> {
  const col = await collection('photos');
  return col
    .find({ deletedAt: null, purgedAt: null }, sessionOf(options))
    .sort({ createdAt: 1 })
    .toArray();
}
