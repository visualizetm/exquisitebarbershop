import { describe, expect, it } from 'vitest';
import { idempotencyKeysRepo } from '../../server/repos';
import { sha256Hex } from '../../server/lib/ids';
import { NOW, useTestDb } from '../helpers/db';

useTestDb();
const hash = sha256Hex('{"a":1}');

describe('idempotencyKeysRepo', () => {
  it('first claim is new, a retry while in progress says so, completion replays the response', async () => {
    expect(
      await idempotencyKeysRepo.beginIdempotencyKey('bookings.create', 'key-00000001', hash, NOW),
    ).toEqual({ state: 'new' });
    expect(
      await idempotencyKeysRepo.beginIdempotencyKey('bookings.create', 'key-00000001', hash, NOW),
    ).toEqual({ state: 'inProgress' });
    await idempotencyKeysRepo.completeIdempotencyKey('bookings.create', 'key-00000001', {
      status: 201,
      body: { id: 'x' },
    });
    expect(
      await idempotencyKeysRepo.beginIdempotencyKey('bookings.create', 'key-00000001', hash, NOW),
    ).toEqual({
      state: 'completed',
      response: { status: 201, body: { id: 'x' } },
    });
  });

  it('the same key with a different body is a mismatch', async () => {
    await idempotencyKeysRepo.beginIdempotencyKey('bookings.create', 'key-00000002', hash, NOW);
    expect(
      await idempotencyKeysRepo.beginIdempotencyKey(
        'bookings.create',
        'key-00000002',
        sha256Hex('other'),
        NOW,
      ),
    ).toEqual({ state: 'mismatch' });
  });

  it('keys are scoped per route and can be released after a failure', async () => {
    await idempotencyKeysRepo.beginIdempotencyKey('scope.a', 'key-00000003', hash, NOW);
    expect(
      await idempotencyKeysRepo.beginIdempotencyKey('scope.b', 'key-00000003', hash, NOW),
    ).toEqual({ state: 'new' });
    await idempotencyKeysRepo.releaseIdempotencyKey('scope.a', 'key-00000003');
    expect(await idempotencyKeysRepo.findIdempotencyKey('scope.a', 'key-00000003')).toBeNull();
    expect(
      await idempotencyKeysRepo.beginIdempotencyKey('scope.a', 'key-00000003', hash, NOW),
    ).toEqual({ state: 'new' });
    const stored = await idempotencyKeysRepo.findIdempotencyKey('scope.a', 'key-00000003');
    expect(stored?.expiresAt.getTime()).toBe(NOW.getTime() + 24 * 3600_000);
  });

  it('concurrent claims: exactly one is new', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        idempotencyKeysRepo.beginIdempotencyKey('bookings.create', 'key-00000009', hash, NOW),
      ),
    );
    expect(results.filter((r) => r.state === 'new')).toHaveLength(1);
  });
});
