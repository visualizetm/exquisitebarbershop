import { setupTokenDocumentSchema, type SetupTokenDocument } from '../../shared/schemas/staffPin';
import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export async function insertSetupToken(
  input: { staffId: string; tokenHash: string; createdByUserId: string; expiresAt: Date },
  now: Date,
  options?: RepoOptions,
): Promise<SetupTokenDocument> {
  const doc = setupTokenDocumentSchema.parse({
    _id: newId(),
    ...input,
    createdAt: now,
    usedAt: null,
  });
  const col = await collection('setupTokens');
  await col.insertOne(doc, sessionOf(options));
  return doc;
}

/** A link that has not been used and has not expired. */
export async function findUsableToken(
  tokenHash: string,
  now: Date,
  options?: RepoOptions,
): Promise<SetupTokenDocument | null> {
  const col = await collection('setupTokens');
  return col.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: now } }, sessionOf(options));
}

/** Marks the link used. False when someone else used it first, so a link works exactly once. */
export async function consumeToken(id: string, now: Date, options?: RepoOptions): Promise<boolean> {
  const col = await collection('setupTokens');
  const result = await col.updateOne(
    { _id: id, usedAt: null },
    { $set: { usedAt: now } },
    sessionOf(options),
  );
  return result.modifiedCount === 1;
}

/** Retires every unused link of a barber (a newer link replaces them). */
export async function retireTokensForStaff(
  staffId: string,
  now: Date,
  options?: RepoOptions,
): Promise<number> {
  const col = await collection('setupTokens');
  const result = await col.updateMany(
    { staffId, usedAt: null },
    { $set: { usedAt: now } },
    sessionOf(options),
  );
  return result.modifiedCount;
}

export async function hasUsableTokenForStaff(
  staffId: string,
  now: Date,
  options?: RepoOptions,
): Promise<boolean> {
  const col = await collection('setupTokens');
  return (
    (await col.countDocuments(
      { staffId, usedAt: null, expiresAt: { $gt: now } },
      { limit: 1, ...sessionOf(options) },
    )) > 0
  );
}

export async function countTokens(options?: RepoOptions): Promise<number> {
  const col = await collection('setupTokens');
  return col.countDocuments({}, sessionOf(options));
}
