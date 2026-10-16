import { beforeEach, describe, expect, it } from 'vitest';
import { emailOutboxRepo } from '../../server/repos';
import { newId } from '../../server/lib/ids';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();

beforeEach(async () => {
  await db().collection('emailOutbox').deleteMany({});
});

function message(
  overrides: Partial<Parameters<typeof emailOutboxRepo.enqueueOutboxMessage>[0]> = {},
) {
  return {
    channel: 'email' as const,
    to: 'customer@example.com',
    template: 'bookingConfirmed' as const,
    payload: { referenceCode: 'ABC-DEFG' },
    dedupeKey: null,
    bookingId: null,
    ...overrides,
  };
}

describe('emailOutboxRepo', () => {
  it('enqueues, claims in order, and marks sent', async () => {
    const bookingId = newId();
    const first = await emailOutboxRepo.enqueueOutboxMessage(message({ bookingId }), NOW);
    const second = await emailOutboxRepo.enqueueOutboxMessage(
      message({ bookingId, template: 'ownerNewBooking' }),
      new Date(NOW.getTime() + 1000),
    );
    expect(first?.status).toBe('pending');
    const claimed = await emailOutboxRepo.claimNextOutboxMessage(new Date(NOW.getTime() + 2000));
    expect(claimed?._id).toBe(first?._id);
    expect(claimed?.status).toBe('sending');
    expect(claimed?.attempts).toBe(1);
    await emailOutboxRepo.markOutboxSent(claimed?._id ?? '', NOW);
    const next = await emailOutboxRepo.claimNextOutboxMessage(new Date(NOW.getTime() + 2000));
    expect(next?._id).toBe(second?._id);
    expect(await emailOutboxRepo.claimNextOutboxMessage(new Date(NOW.getTime() + 2000))).toBeNull();
    expect(await emailOutboxRepo.listOutboxForBooking(bookingId)).toHaveLength(2);
    expect(await emailOutboxRepo.listOutboxByStatus('sent')).toHaveLength(1);
  });

  it('the dedupe key index prevents a second copy and returns null', async () => {
    const a = await emailOutboxRepo.enqueueOutboxMessage(
      message({ dedupeKey: 'booking:1:confirmed' }),
      NOW,
    );
    const b = await emailOutboxRepo.enqueueOutboxMessage(
      message({ dedupeKey: 'booking:1:confirmed' }),
      NOW,
    );
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    // Messages without a dedupe key are not affected by the partial unique index.
    expect(await emailOutboxRepo.enqueueOutboxMessage(message(), NOW)).not.toBeNull();
    expect(await emailOutboxRepo.enqueueOutboxMessage(message(), NOW)).not.toBeNull();
  });

  it('a failure backs off, then parks the message after max attempts, and requeue revives it', async () => {
    const m = await emailOutboxRepo.enqueueOutboxMessage(message({ maxAttempts: 2 }), NOW);
    const id = m?._id ?? '';
    await emailOutboxRepo.claimNextOutboxMessage(NOW);
    const afterFirst = await emailOutboxRepo.markOutboxFailed(id, 'smtp down', NOW);
    expect(afterFirst?.status).toBe('pending');
    expect(afterFirst?.nextAttemptAt.getTime()).toBe(NOW.getTime() + 2 * 60_000);
    expect(await emailOutboxRepo.claimNextOutboxMessage(NOW)).toBeNull();
    const retryTime = new Date(NOW.getTime() + 3 * 60_000);
    const claimed = await emailOutboxRepo.claimNextOutboxMessage(retryTime);
    expect(claimed?.attempts).toBe(2);
    const afterSecond = await emailOutboxRepo.markOutboxFailed(id, 'still down', retryTime);
    expect(afterSecond?.status).toBe('failed');
    expect(await emailOutboxRepo.requeueOutboxMessage(id, retryTime)).toBe(true);
    expect(await emailOutboxRepo.requeueOutboxMessage(id, retryTime)).toBe(false);
    expect(await emailOutboxRepo.markOutboxFailed(newId(), 'x', NOW)).toBeNull();
  });
});
