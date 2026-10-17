import { auditLogDocumentSchema, type AuditLogDocument } from '../../shared/schemas/auditLog';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export type AuditEntryInput = Omit<AuditLogDocument, '_id' | 'at'>;

/** Appends an entry. Call it inside the transaction of the change it describes. */
export async function appendAuditEntry(
  input: AuditEntryInput,
  now: Date,
  options?: RepoOptions,
): Promise<AuditLogDocument> {
  const doc = auditLogDocumentSchema.parse({ _id: newId(), at: now, ...input });
  const col = await collection('auditLog');
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

export async function listAuditForEntity(
  entityType: string,
  entityId: string,
  limit = 100,
  options?: RepoOptions,
): Promise<AuditLogDocument[]> {
  const col = await collection('auditLog');
  return col
    .find({ entityType, entityId }, sessionOf(options))
    .sort({ at: -1 })
    .limit(limit)
    .toArray();
}

export async function listRecentAudit(
  limit = 100,
  options?: RepoOptions,
): Promise<AuditLogDocument[]> {
  const col = await collection('auditLog');
  return col.find({}, sessionOf(options)).sort({ at: -1 }).limit(limit).toArray();
}

export interface AuditPageFilter {
  entityType?: string;
  entityId?: string;
  actionPrefix?: string;
  actorType?: AuditLogDocument['actor']['type'];
  start?: Date;
  end?: Date;
}

/** Newest first, after an optional cursor position. */
export async function listAuditPage(
  filter: AuditPageFilter,
  before: { at: Date; id: string } | null,
  limit: number,
  options?: RepoOptions,
): Promise<AuditLogDocument[]> {
  const col = await collection('auditLog');
  const and: Record<string, unknown>[] = [];
  if (filter.entityType) and.push({ entityType: filter.entityType });
  if (filter.entityId) and.push({ entityId: filter.entityId });
  if (filter.actionPrefix) {
    and.push({
      action: { $regex: `^${filter.actionPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` },
    });
  }
  if (filter.actorType) and.push({ 'actor.type': filter.actorType });
  if (filter.start) and.push({ at: { $gte: filter.start } });
  if (filter.end) and.push({ at: { $lt: filter.end } });
  if (before)
    and.push({ $or: [{ at: { $lt: before.at } }, { at: before.at, _id: { $lt: before.id } }] });
  const query = and.length > 0 ? { $and: and } : {};
  return col.find(query, sessionOf(options)).sort({ at: -1, _id: -1 }).limit(limit).toArray();
}
