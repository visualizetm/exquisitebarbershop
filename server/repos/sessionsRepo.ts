import { sessionDocumentSchema, type SessionDocument } from '../../shared/schemas/session';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export interface SessionInput {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
}

export async function insertSession(
  input: SessionInput,
  now: Date,
  options?: RepoOptions,
): Promise<SessionDocument> {
  const doc = sessionDocumentSchema.parse({
    _id: newId(),
    ...input,
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
  });
  const col = await collection('sessions');
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

/** A live session: matching hash, not revoked, not expired. */
export async function findActiveSession(
  tokenHash: string,
  now: Date,
  options?: RepoOptions,
): Promise<SessionDocument | null> {
  const col = await collection('sessions');
  return col.findOne({ tokenHash, revokedAt: null, expiresAt: { $gt: now } }, sessionOf(options));
}

/** Sliding expiry: refresh lastSeenAt and push expiresAt forward. */
export async function touchSession(
  id: string,
  now: Date,
  newExpiresAt: Date,
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('sessions');
  await col.updateOne(
    { _id: id },
    { $set: { lastSeenAt: now, expiresAt: newExpiresAt } },
    sessionOf(options),
  );
}

export async function revokeSession(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<boolean> {
  const col = await collection('sessions');
  const result = await col.updateOne(
    { _id: id, revokedAt: null },
    { $set: { revokedAt: now } },
    sessionOf(options),
  );
  return result.modifiedCount === 1;
}

export async function revokeAllSessionsForUser(
  userId: string,
  now: Date,
  options?: RepoOptions,
): Promise<number> {
  const col = await collection('sessions');
  const result = await col.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: now } },
    sessionOf(options),
  );
  return result.modifiedCount;
}

export async function listSessionsForUser(
  userId: string,
  options?: RepoOptions,
): Promise<SessionDocument[]> {
  const col = await collection('sessions');
  return col.find({ userId }, sessionOf(options)).sort({ createdAt: -1 }).toArray();
}
