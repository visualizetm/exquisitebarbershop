import { collection } from '../db/collections';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export interface RateLimitRule {
  /** Maximum hits allowed per window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter. One atomic upsert per hit; the unique (key, windowStart)
 * index means concurrent hits increment the same document.
 */
export async function hitRateLimit(
  key: string,
  rule: RateLimitRule,
  now: Date,
  options?: RepoOptions,
): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
  const windowEnd = new Date(windowStart.getTime() + rule.windowMs);
  const col = await collection('rateLimits');
  const doc = await col.findOneAndUpdate(
    { key, windowStart },
    { $inc: { count: 1 }, $setOnInsert: { _id: newId(), key, windowStart, expiresAt: windowEnd } },
    { upsert: true, returnDocument: 'after', ...sessionOf(options) },
  );
  const count = doc?.count ?? 1;
  return {
    allowed: count <= rule.limit,
    count,
    limit: rule.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd.getTime() - now.getTime()) / 1000)),
  };
}

export async function peekRateLimit(
  key: string,
  rule: RateLimitRule,
  now: Date,
  options?: RepoOptions,
): Promise<number> {
  const windowStart = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
  const col = await collection('rateLimits');
  const doc = await col.findOne({ key, windowStart }, sessionOf(options));
  return doc?.count ?? 0;
}
