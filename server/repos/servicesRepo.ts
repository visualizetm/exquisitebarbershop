import type { Filter } from 'mongodb';
import {
  serviceDocumentSchema,
  serviceInputSchema,
  serviceUpdateSchema,
  type ServiceDocument,
  type ServiceInput,
  type ServiceUpdate,
} from '../../shared/schemas/service';
import { collection } from '../db/collections';
import { AppError } from '../lib/errors';
import { newId } from '../lib/ids';
import { stripUndefined } from '../lib/objects';
import { sessionOf, type RepoOptions } from './types';

export async function insertService(
  input: ServiceInput,
  now: Date,
  options?: RepoOptions & { id?: string },
): Promise<ServiceDocument> {
  const parsed = serviceInputSchema.parse(input);
  const doc = serviceDocumentSchema.parse({
    _id: options?.id ?? newId(),
    ...parsed,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const col = await collection('services');
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

export async function findServiceById(
  id: string,
  options?: RepoOptions,
): Promise<ServiceDocument | null> {
  const col = await collection('services');
  return col.findOne({ _id: id }, sessionOf(options));
}

/** Returns the services in the order of `ids`. Missing ids are simply absent. */
export async function findServicesByIds(
  ids: readonly string[],
  options?: RepoOptions,
): Promise<ServiceDocument[]> {
  if (ids.length === 0) return [];
  const col = await collection('services');
  const docs = await col.find({ _id: { $in: [...ids] } }, sessionOf(options)).toArray();
  const byId = new Map(docs.map((d) => [d._id, d]));
  return ids.flatMap((id) => {
    const doc = byId.get(id);
    return doc ? [doc] : [];
  });
}

/** Bookable services for the public menu. */
export async function listPublicServices(options?: RepoOptions): Promise<ServiceDocument[]> {
  const col = await collection('services');
  return col
    .find({ deletedAt: null, isActive: true }, sessionOf(options))
    .sort({ group: 1, sortOrder: 1, name: 1 })
    .toArray();
}

export async function listServices(
  filter: { includeDeleted?: boolean } = {},
  options?: RepoOptions,
): Promise<ServiceDocument[]> {
  const col = await collection('services');
  const query: Filter<ServiceDocument> = filter.includeDeleted ? {} : { deletedAt: null };
  return col.find(query, sessionOf(options)).sort({ group: 1, sortOrder: 1, name: 1 }).toArray();
}

export async function updateService(
  id: string,
  patch: ServiceUpdate,
  now: Date,
  options?: RepoOptions,
): Promise<ServiceDocument> {
  const parsed = stripUndefined(serviceUpdateSchema.parse(patch));
  const col = await collection('services');
  const updated = await col.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { ...parsed, updatedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Service was not found');
  return updated;
}

/** Soft delete. Bookings keep their service snapshot, so nothing dangles. */
export async function softDeleteService(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<ServiceDocument> {
  const col = await collection('services');
  const updated = await col.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { deletedAt: now, isActive: false, updatedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Service was not found');
  return updated;
}
