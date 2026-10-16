import { describe, expect, it } from 'vitest';

type RawDoc = { _id: string } & Record<string, unknown>;
import { withTransaction } from '../../server/db/transaction';
import { newId } from '../../server/lib/ids';
import { bookingsRepo, slotLocksRepo } from '../../server/repos';
import { NOW, useTestDb } from '../helpers/db';
import { bookingInput } from '../helpers/fixtures';

const { db } = useTestDb();

const range = { start: new Date('2026-03-12T14:00:00Z'), end: new Date('2026-03-12T14:45:00Z') };

describe('slotLocksRepo: the double booking guard', () => {
  it('acquires one lock per 15 minute block', async () => {
    const staffId = newId();
    const holder = { holderType: 'booking' as const, holderId: newId() };
    const locks = await slotLocksRepo.acquireSlotLocks(staffId, range, holder, NOW);
    expect(locks.map((l) => l.slotStart.toISOString())).toEqual([
      '2026-03-12T14:00:00.000Z',
      '2026-03-12T14:15:00.000Z',
      '2026-03-12T14:30:00.000Z',
    ]);
    expect(await slotLocksRepo.listSlotLocksForStaff(staffId, range)).toHaveLength(3);
    expect(await slotLocksRepo.listSlotLocksForHolder(holder.holderId)).toHaveLength(3);
  });

  it('a second holder overlapping any block is rejected with SLOT_TAKEN', async () => {
    const staffId = newId();
    await slotLocksRepo.acquireSlotLocks(
      staffId,
      range,
      { holderType: 'booking', holderId: newId() },
      NOW,
    );
    await expect(
      slotLocksRepo.acquireSlotLocks(
        staffId,
        { start: new Date('2026-03-12T14:30:00Z'), end: new Date('2026-03-12T15:00:00Z') },
        { holderType: 'booking', holderId: newId() },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
    // Another chair at the same time is fine.
    await expect(
      slotLocksRepo.acquireSlotLocks(
        newId(),
        range,
        { holderType: 'booking', holderId: newId() },
        NOW,
      ),
    ).resolves.toHaveLength(3);
    // Adjacent, non-overlapping range on the same chair is fine.
    await expect(
      slotLocksRepo.acquireSlotLocks(
        staffId,
        { start: new Date('2026-03-12T14:45:00Z'), end: new Date('2026-03-12T15:00:00Z') },
        { holderType: 'booking', holderId: newId() },
        NOW,
      ),
    ).resolves.toHaveLength(1);
  });

  it('the unique index itself rejects a raw duplicate insert', async () => {
    const staffId = newId();
    const slotStart = new Date('2026-03-12T20:00:00Z');
    await db().collection<RawDoc>('slotLocks').insertOne({
      _id: newId(),
      staffId,
      slotStart,
      holderType: 'booking',
      holderId: newId(),
      createdAt: NOW,
    });
    await expect(
      db().collection<RawDoc>('slotLocks').insertOne({
        _id: newId(),
        staffId,
        slotStart,
        holderType: 'booking',
        holderId: newId(),
        createdAt: NOW,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('a booking and its locks commit together, and a conflict rolls both back', async () => {
    const staffId = newId();
    const first = await withTransaction(async (session) => {
      const booking = await bookingsRepo.insertBooking(
        bookingInput({ staffId, startAt: range.start, endAt: range.end }),
        NOW,
        { session },
      );
      await slotLocksRepo.acquireSlotLocks(
        staffId,
        range,
        { holderType: 'booking', holderId: booking._id },
        NOW,
        { session },
      );
      return booking;
    });
    const beforeCount = await db().collection('bookings').countDocuments({ staffId });
    await expect(
      withTransaction(async (session) => {
        const booking = await bookingsRepo.insertBooking(
          bookingInput({ staffId, startAt: range.start, endAt: range.end }),
          NOW,
          { session },
        );
        await slotLocksRepo.acquireSlotLocks(
          staffId,
          range,
          { holderType: 'booking', holderId: booking._id },
          NOW,
          { session },
        );
        return booking;
      }),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
    expect(await db().collection('bookings').countDocuments({ staffId })).toBe(beforeCount);
    expect(await slotLocksRepo.listSlotLocksForStaff(staffId, range)).toHaveLength(3);
    expect(await slotLocksRepo.listSlotLocksForHolder(first._id)).toHaveLength(3);
  });

  it('concurrent attempts on the same chair: exactly one wins', async () => {
    const staffId = newId();
    const attempts = Array.from({ length: 6 }, () =>
      withTransaction(async (session) => {
        const booking = await bookingsRepo.insertBooking(
          bookingInput({ staffId, startAt: range.start, endAt: range.end }),
          NOW,
          { session },
        );
        await slotLocksRepo.acquireSlotLocks(
          staffId,
          range,
          { holderType: 'booking', holderId: booking._id },
          NOW,
          { session },
        );
        return booking._id;
      }).then(
        (id) => ({ ok: true as const, id }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    );
    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    expect(await db().collection('bookings').countDocuments({ staffId })).toBe(1);
    expect(await slotLocksRepo.listSlotLocksForStaff(staffId, range)).toHaveLength(3);
  });

  it('releasing a holder frees the chair in the same transaction as the cancel', async () => {
    const staffId = newId();
    const booking = await withTransaction(async (session) => {
      const b = await bookingsRepo.insertBooking(
        bookingInput({ staffId, startAt: range.start, endAt: range.end }),
        NOW,
        { session },
      );
      await slotLocksRepo.acquireSlotLocks(
        staffId,
        range,
        { holderType: 'booking', holderId: b._id },
        NOW,
        { session },
      );
      return b;
    });
    await withTransaction(async (session) => {
      await bookingsRepo.cancelBooking(
        booking._id,
        { at: NOW, by: 'customer', reason: null },
        NOW,
        { session },
      );
      expect(await slotLocksRepo.releaseSlotLocks(booking._id, { session })).toBe(3);
    });
    expect(await slotLocksRepo.listSlotLocksForStaff(staffId, range)).toHaveLength(0);
    await expect(
      slotLocksRepo.acquireSlotLocks(
        staffId,
        range,
        { holderType: 'booking', holderId: newId() },
        NOW,
      ),
    ).resolves.toHaveLength(3);
  });

  it('refuses to lock an empty range', async () => {
    await expect(
      slotLocksRepo.acquireSlotLocks(
        newId(),
        { start: range.start, end: range.start },
        { holderType: 'timeBlock', holderId: newId() },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
