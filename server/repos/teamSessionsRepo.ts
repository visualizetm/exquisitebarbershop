import { teamSessionDocumentSchema, type TeamSessionDocument } from '../../shared/schemas/staffPin';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export async function insertTeamSession(
  input: {
    tokenHash: string;
    staffId: string;
    expiresAt: Date;
    ip: string | null;
    userAgent: string | null;
  },
  now: Date,
  options?: RepoOptions,
): Promise<TeamSessionDocument> {
  const doc = teamSessionDocumentSchema.parse({
    _id: newId(),
    ...input,
    createdAt: now,
    revokedAt: null,
  });
  const col = await collection('teamSessions');
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

/** A live session: matching hash, not revoked, not past its absolute end. */
export async function findActiveTeamSession(
  tokenHash: string,
  now: Date,
  options?: RepoOptions,
): Promise<TeamSessionDocument | null> {
  const col = await collection('teamSessions');
  return col.findOne({ tokenHash, revokedAt: null, expiresAt: { $gt: now } }, sessionOf(options));
}

export async function findTeamSessionById(
  id: string,
  options?: RepoOptions,
): Promise<TeamSessionDocument | null> {
  const col = await collection('teamSessions');
  return col.findOne({ _id: id }, sessionOf(options));
}

export async function revokeTeamSession(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<boolean> {
  const col = await collection('teamSessions');
  const result = await col.updateOne(
    { _id: id, revokedAt: null },
    { $set: { revokedAt: now } },
    sessionOf(options),
  );
  return result.modifiedCount === 1;
}

/** Ends every live session of one barber, or all but one (the phone changing the PIN). */
export async function revokeTeamSessionsForStaff(
  staffId: string,
  now: Date,
  options?: RepoOptions & { exceptId?: string },
): Promise<number> {
  const col = await collection('teamSessions');
  const result = await col.updateMany(
    {
      staffId,
      revokedAt: null,
      ...(options?.exceptId ? { _id: { $ne: options.exceptId } } : {}),
    },
    { $set: { revokedAt: now } },
    sessionOf(options),
  );
  return result.modifiedCount;
}
