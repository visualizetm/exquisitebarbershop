import type { LoginThrottleDocument } from '../../shared/schemas/loginThrottle';
import { collection } from '../db/collections';
import { sessionOf, type RepoOptions } from './types';

/** How long the failure history is kept after the last failed attempt. */
export const THROTTLE_MEMORY_MS = 24 * 60 * 60_000;

export async function getLoginThrottle(
  emailHash: string,
  options?: RepoOptions,
): Promise<LoginThrottleDocument | null> {
  const col = await collection('loginThrottle');
  return col.findOne({ _id: emailHash }, sessionOf(options));
}

/**
 * Records one failed attempt. After `threshold` consecutive failures the email is
 * locked for lockMinutes[level] and the level rises, so repeat offenders wait
 * longer. Atomic per email, so concurrent failures each count.
 */
export async function recordLoginFailure(
  emailHash: string,
  rule: { threshold: number; lockMinutes: readonly number[] },
  now: Date,
  options?: RepoOptions,
): Promise<LoginThrottleDocument> {
  const col = await collection('loginThrottle');
  const after = await col.findOneAndUpdate(
    { _id: emailHash },
    {
      $inc: { failures: 1 },
      $set: { updatedAt: now, expiresAt: new Date(now.getTime() + THROTTLE_MEMORY_MS) },
      $setOnInsert: { lockoutLevel: 0, lockedUntil: null },
    },
    { upsert: true, returnDocument: 'after', ...sessionOf(options) },
  );
  if (!after) throw new Error('upsert returned no document');
  if (after.failures < rule.threshold) return after;
  const index = Math.min(after.lockoutLevel, rule.lockMinutes.length - 1);
  const minutes = rule.lockMinutes[index] ?? 15;
  const locked = await col.findOneAndUpdate(
    { _id: emailHash },
    {
      $set: {
        failures: 0,
        lockedUntil: new Date(now.getTime() + minutes * 60_000),
        updatedAt: now,
      },
      $inc: { lockoutLevel: 1 },
    },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  return locked ?? after;
}

/** A successful sign-in, or an operator reset, forgets the history. */
export async function clearLoginThrottle(emailHash: string, options?: RepoOptions): Promise<void> {
  const col = await collection('loginThrottle');
  await col.deleteOne({ _id: emailHash }, sessionOf(options));
}
