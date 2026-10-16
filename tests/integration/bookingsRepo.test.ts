import { describe, expect, it } from 'vitest';
import { bookingsRepo } from '../../server/repos';
import { ReferenceCodeCollision } from '../../server/repos/bookingsRepo';
import { newId } from '../../server/lib/ids';
import { NOW, useTestDb } from '../helpers/db';
import { bookingInput } from '../helpers/fixtures';

useTestDb();

describe('bookingsRepo', () => {
  it('inserts and finds by id and reference code', async () => {
    const b = await bookingsRepo.insertBooking(bookingInput({ referenceCode: 'ABC-DEFG' }), NOW);
    expect((await bookingsRepo.findBookingById(b._id))?.referenceCode).toBe('ABC-DEFG');
    expect((await bookingsRepo.findBookingByReferenceCode('ABC-DEFG'))?._id).toBe(b._id);
  });

  it('the unique reference code index rejects a duplicate as a collision the service can retry', async () => {
    await bookingsRepo.insertBooking(bookingInput({ referenceCode: 'DUP-LKEY' }), NOW);
    await expect(
      bookingsRepo.insertBooking(bookingInput({ referenceCode: 'DUP-LKEY' }), NOW),
    ).rejects.toBeInstanceOf(ReferenceCodeCollision);
  });

  it('lists bookings overlapping a range with staff and status filters', async () => {
    const staffId = newId();
    const inRange = await bookingsRepo.insertBooking(
      bookingInput({
        staffId,
        startAt: new Date('2026-03-12T14:00:00Z'),
        endAt: new Date('2026-03-12T14:30:00Z'),
      }),
      NOW,
    );
    await bookingsRepo.insertBooking(
      bookingInput({
        staffId,
        startAt: new Date('2026-03-13T14:00:00Z'),
        endAt: new Date('2026-03-13T14:30:00Z'),
      }),
      NOW,
    );
    const cancelled = await bookingsRepo.insertBooking(
      bookingInput({
        staffId,
        startAt: new Date('2026-03-12T15:00:00Z'),
        endAt: new Date('2026-03-12T15:30:00Z'),
      }),
      NOW,
    );
    await bookingsRepo.cancelBooking(cancelled._id, { at: NOW, by: 'customer', reason: null }, NOW);
    const day = { start: new Date('2026-03-12T00:00:00Z'), end: new Date('2026-03-13T00:00:00Z') };
    expect((await bookingsRepo.listBookingsBetween(day, { staffId })).map((b) => b._id)).toEqual([
      inRange._id,
      cancelled._id,
    ]);
    expect(
      (await bookingsRepo.listBookingsBetween(day, { staffId, statuses: ['confirmed'] })).map(
        (b) => b._id,
      ),
    ).toEqual([inRange._id]);
    expect(await bookingsRepo.listBookingsBetween(day, { staffId: newId() })).toEqual([]);
  });

  it('cancelling bumps the manage token version and cannot happen twice', async () => {
    const b = await bookingsRepo.insertBooking(bookingInput(), NOW);
    const cancelled = await bookingsRepo.cancelBooking(
      b._id,
      { at: NOW, by: 'owner', reason: 'Sick' },
      NOW,
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.manageTokenVersion).toBe(2);
    expect(cancelled.cancellation?.reason).toBe('Sick');
    await expect(
      bookingsRepo.cancelBooking(b._id, { at: NOW, by: 'owner', reason: null }, NOW),
    ).rejects.toMatchObject({
      code: 'BOOKING_NOT_CANCELLABLE',
    });
  });

  it('rescheduling moves the booking and bumps the token version', async () => {
    const b = await bookingsRepo.insertBooking(bookingInput(), NOW);
    const moved = await bookingsRepo.rescheduleBooking(
      b._id,
      {
        staffId: b.staffId,
        staffRequested: true,
        startAt: new Date('2026-03-14T14:00:00Z'),
        endAt: new Date('2026-03-14T14:30:00Z'),
        bufferMinutes: 0,
      },
      NOW,
    );
    expect(moved.startAt.toISOString()).toBe('2026-03-14T14:00:00.000Z');
    expect(moved.manageTokenVersion).toBe(2);
    await bookingsRepo.cancelBooking(b._id, { at: NOW, by: 'customer', reason: null }, NOW);
    await expect(
      bookingsRepo.rescheduleBooking(
        b._id,
        {
          staffId: b.staffId,
          staffRequested: true,
          startAt: NOW,
          endAt: new Date(NOW.getTime() + 60_000),
          bufferMinutes: 0,
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'BOOKING_NOT_RESCHEDULABLE' });
  });

  it('counts open bookings per phone, lists history, and updates status and notes', async () => {
    const phone = '+12155550199';
    const future = new Date(NOW.getTime() + 2 * 24 * 60 * 60_000);
    const past = new Date(NOW.getTime() - 2 * 24 * 60 * 60_000);
    const a = await bookingsRepo.insertBooking(
      bookingInput({
        customer: { name: 'A', phone, email: null },
        startAt: future,
        endAt: new Date(future.getTime() + 1800_000),
      }),
      NOW,
    );
    await bookingsRepo.insertBooking(
      bookingInput({
        customer: { name: 'A', phone, email: null },
        startAt: past,
        endAt: new Date(past.getTime() + 1800_000),
      }),
      NOW,
    );
    expect(await bookingsRepo.countOpenBookingsForPhone(phone, NOW)).toBe(1);
    expect(await bookingsRepo.listBookingsForPhone(phone, 10)).toHaveLength(2);
    expect((await bookingsRepo.setBookingStatus(a._id, 'completed', NOW)).status).toBe('completed');
    expect((await bookingsRepo.updateBookingNotes(a._id, 'Prefers scissors', NOW)).notes).toBe(
      'Prefers scissors',
    );
    await expect(bookingsRepo.setBookingStatus(newId(), 'completed', NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(bookingsRepo.updateBookingNotes(newId(), null, NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('validates documents before insert', async () => {
    await expect(
      bookingsRepo.insertBooking(bookingInput({ totalPriceCents: -1 }), NOW),
    ).rejects.toThrow();
    await expect(bookingsRepo.insertBooking(bookingInput({ services: [] }), NOW)).rejects.toThrow();
  });
});
