import type { Filter } from 'mongodb';
import {
  staffDocumentSchema,
  staffInputSchema,
  staffUpdateSchema,
  type StaffDocument,
  type StaffInput,
  type StaffUpdate,
} from '../../shared/schemas/staff';
import { slugSchema } from '../../shared/schemas/common';
import { collection } from '../db/collections';
import { AppError, isDuplicateKeyError } from '../lib/errors';
import { newId } from '../lib/ids';
import { stripUndefined } from '../lib/objects';
import { sessionOf, type RepoOptions } from './types';

function slugKeysOf(slug: string, aliases: readonly string[]): string[] {
  return Array.from(new Set([slug, ...aliases]));
}

function slugTaken(slug: string, cause: unknown): AppError {
  return new AppError('SLUG_TAKEN', `The slug "${slug}" is already in use`, { cause });
}

export async function insertStaff(
  input: StaffInput,
  now: Date,
  options?: RepoOptions & { id?: string },
): Promise<StaffDocument> {
  const parsed = staffInputSchema.parse(input);
  const doc = staffDocumentSchema.parse({
    _id: options?.id ?? newId(),
    ...parsed,
    slugAliases: [],
    slugKeys: slugKeysOf(parsed.slug, []),
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const col = await collection('staff');
  try {
    await col.insertOne(doc, sessionOf(options));
  } catch (error) {
    if (isDuplicateKeyError(error)) throw slugTaken(doc.slug, error);
    throw error;
  }
  return doc;
}

export async function findStaffById(
  id: string,
  options?: RepoOptions,
): Promise<StaffDocument | null> {
  const col = await collection('staff');
  return col.findOne({ _id: id }, sessionOf(options));
}

/** Resolves a current slug or any former slug. Deleted staff still resolve so old links explain themselves. */
export async function findStaffBySlug(
  slug: string,
  options?: RepoOptions,
): Promise<StaffDocument | null> {
  const col = await collection('staff');
  return col.findOne({ slugKeys: slug }, sessionOf(options));
}

export async function findStaffByIds(
  ids: readonly string[],
  options?: RepoOptions,
): Promise<StaffDocument[]> {
  if (ids.length === 0) return [];
  const col = await collection('staff');
  return col.find({ _id: { $in: [...ids] } }, sessionOf(options)).toArray();
}

/** Staff shown on the public site, in display order. */
export async function listPublicStaff(options?: RepoOptions): Promise<StaffDocument[]> {
  const col = await collection('staff');
  return col
    .find({ deletedAt: null, showOnWebsite: true }, sessionOf(options))
    .sort({ sortOrder: 1, name: 1 })
    .toArray();
}

export async function listStaff(
  filter: { includeDeleted?: boolean } = {},
  options?: RepoOptions,
): Promise<StaffDocument[]> {
  const col = await collection('staff');
  const query: Filter<StaffDocument> = filter.includeDeleted ? {} : { deletedAt: null };
  return col.find(query, sessionOf(options)).sort({ sortOrder: 1, name: 1 }).toArray();
}

/** Updates editable fields. A slug change goes through renameStaffSlug instead. */
export async function updateStaff(
  id: string,
  patch: StaffUpdate,
  now: Date,
  options?: RepoOptions,
): Promise<StaffDocument> {
  const parsed = stripUndefined(staffUpdateSchema.parse(patch));
  if (parsed.slug !== undefined) {
    throw new AppError('BAD_REQUEST', 'Use the slug rename operation to change a slug');
  }
  const col = await collection('staff');
  const updated = await col.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { ...parsed, updatedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Staff member was not found');
  return updated;
}

/**
 * Changes the public slug and keeps the old one as an alias forever. The unique
 * multikey index on slugKeys rejects the rename when any staff member already owns
 * the new slug, now or in the past.
 */
export async function renameStaffSlug(
  id: string,
  newSlug: string,
  now: Date,
  options?: RepoOptions,
): Promise<StaffDocument> {
  const slug = slugSchema.parse(newSlug);
  const current = await findStaffById(id, options);
  if (!current || current.deletedAt) throw new AppError('NOT_FOUND', 'Staff member was not found');
  if (current.slug === slug) return current;
  const aliases = current.slugAliases.filter((a) => a !== slug);
  if (current.slugKeys.includes(slug)) {
    // Reclaiming one of their own former slugs: the old current slug becomes an alias.
    aliases.push(current.slug);
  } else {
    aliases.push(current.slug);
  }
  const col = await collection('staff');
  try {
    const updated = await col.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          slug,
          slugAliases: Array.from(new Set(aliases)),
          slugKeys: slugKeysOf(slug, aliases),
          updatedAt: now,
        },
      },
      { returnDocument: 'after', ...sessionOf(options) },
    );
    if (!updated) throw new AppError('NOT_FOUND', 'Staff member was not found');
    return updated;
  } catch (error) {
    if (isDuplicateKeyError(error)) throw slugTaken(slug, error);
    throw error;
  }
}

/** Soft delete. The record and its slugs stay so bookings and old links keep resolving. */
export async function softDeleteStaff(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<StaffDocument> {
  const col = await collection('staff');
  const updated = await col.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { deletedAt: now, acceptsOnlineBooking: false, showOnWebsite: false, updatedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Staff member was not found');
  return updated;
}
