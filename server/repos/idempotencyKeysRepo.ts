import {
  idempotencyKeyDocumentSchema,
  type IdempotencyKeyDocument,
} from '../../shared/schemas/idempotencyKey';
import { collection } from '../db/collections';
import { isDuplicateKeyError } from '../lib/errors';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotencyBegin =
  | { state: 'new' }
  | { state: 'inProgress' }
  | { state: 'completed'; response: { status: number; body: unknown } }
  | { state: 'mismatch' };

/**
 * Claims a key for a request. "new" means proceed; the caller must then call
 * completeIdempotencyKey or releaseIdempotencyKey. The unique (scope, key) index
 * makes the claim atomic across concurrent retries.
 */
export async function beginIdempotencyKey(
  scope: string,
  key: string,
  requestHash: string,
  now: Date,
  options?: RepoOptions,
): Promise<IdempotencyBegin> {
  const col = await collection('idempotencyKeys');
  const doc = idempotencyKeyDocumentSchema.parse({
    _id: newId(),
    scope,
    key,
    requestHash,
    status: 'inProgress',
    response: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
  });
  try {
    await col.insertOne(doc, sessionOf(options));
    return { state: 'new' };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  const existing = await col.findOne({ scope, key }, sessionOf(options));
  if (!existing) return { state: 'inProgress' };
  if (existing.requestHash !== requestHash) return { state: 'mismatch' };
  if (existing.status === 'completed' && existing.response) {
    return { state: 'completed', response: existing.response };
  }
  return { state: 'inProgress' };
}

export async function completeIdempotencyKey(
  scope: string,
  key: string,
  response: { status: number; body: unknown },
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('idempotencyKeys');
  await col.updateOne(
    { scope, key },
    { $set: { status: 'completed', response } },
    sessionOf(options),
  );
}

/** Drops a claim after a failed request so the client may retry with the same key. */
export async function releaseIdempotencyKey(
  scope: string,
  key: string,
  options?: RepoOptions,
): Promise<void> {
  const col = await collection('idempotencyKeys');
  await col.deleteOne({ scope, key, status: 'inProgress' }, sessionOf(options));
}

export async function findIdempotencyKey(
  scope: string,
  key: string,
  options?: RepoOptions,
): Promise<IdempotencyKeyDocument | null> {
  const col = await collection('idempotencyKeys');
  return col.findOne({ scope, key }, sessionOf(options));
}
