import { describe, expect, it } from 'vitest';
import { rateLimitsRepo } from '../../server/repos';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();
const rule = { limit: 3, windowMs: 60_000 };

describe('rateLimitsRepo', () => {
  it('allows up to the limit in a window, then blocks with a retry hint', async () => {
    const key = 'login:ip:203.0.113.4';
    for (let i = 1; i <= 3; i += 1) {
      const r = await rateLimitsRepo.hitRateLimit(key, rule, NOW);
      expect(r.allowed).toBe(true);
      expect(r.count).toBe(i);
    }
    const blocked = await rateLimitsRepo.hitRateLimit(key, rule, new Date(NOW.getTime() + 10_000));
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(50);
    expect(await rateLimitsRepo.peekRateLimit(key, rule, NOW)).toBe(4);
    const nextWindow = await rateLimitsRepo.hitRateLimit(
      key,
      rule,
      new Date(NOW.getTime() + 61_000),
    );
    expect(nextWindow.count).toBe(1);
    expect(await db().collection('rateLimits').countDocuments({ key })).toBe(2);
  });

  it('concurrent hits share one counter thanks to the unique (key, window) index', async () => {
    const key = 'booking:ip:198.51.100.7';
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        rateLimitsRepo.hitRateLimit(key, { limit: 100, windowMs: 60_000 }, NOW),
      ),
    );
    expect(Math.max(...results.map((r) => r.count))).toBe(10);
    expect(await db().collection('rateLimits').countDocuments({ key })).toBe(1);
    expect(await rateLimitsRepo.peekRateLimit('unknown', rule, NOW)).toBe(0);
  });
});
