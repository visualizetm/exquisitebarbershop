import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '../../shared/api/errors';
import { createBookingResponseSchema } from '../../shared/api/bookings';
import { createManageToken } from '../../server/lib/manageToken';
import { newId } from '../../server/lib/ids';
import { bookingsRepo, emailOutboxRepo, slotLocksRepo, staffRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, staffSeedId } from '../../seed/shop';
import { NOW, TEST_MANAGE_SECRET, useTestDb } from '../helpers/db';
import {
  call,
  idemKey,
  nextDate,
  phone,
  slotAt,
  startTestServer,
  type TestServer,
} from '../helpers/bookingApi';
import { bookingInput } from '../helpers/fixtures';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
const WED = nextDate(3, 3);
const THU = nextDate(4, 3);
const SUN = nextDate(7, 3);
const cutId = serviceSeedId('classic-cut');
const beardId = serviceSeedId('beard-trim');

function body(overrides: Record<string, unknown> = {}) {
  return {
    serviceIds: [cutId],
    staff: 'marcus',
    startAt: slotAt(WED, '10:00'),
    customer: { name: 'Sam Customer', phone: phone(), email: 'sam@example.com' },
    ...overrides,
  };
}

function post(payload: unknown, headers: Record<string, string> = {}) {
  return call(server.baseUrl, 'POST', '/api/bookings', {
    body: payload,
    headers: { 'idempotency-key': idemKey(), ...headers },
  });
}

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

describe('POST /api/bookings', () => {
  it('happy path: creates the booking, its locks, audit entry, outbox rows and a manage link', async () => {
    const res = await post(body({ serviceIds: [cutId, beardId], notes: 'Scissors please' }));
    expect(res.status).toBe(201);
    const parsed = createBookingResponseSchema.parse(res.body);
    expect(parsed.booking.referenceCode).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{4}$/);
    expect(parsed.booking.staff.slug).toBe('marcus');
    expect(parsed.booking.durationMinutes).toBe(45);
    expect(parsed.booking.totalPriceCents).toBe(5000);
    expect(parsed.booking.customer.phone).toMatch(/^\+1215\d{7}$/);
    expect(parsed.managePath).toMatch(/^\/manage\?token=v1\./);
    expect(res.headers.get('idempotent-replayed')).toBe('false');
    expect(JSON.stringify(res.body)).not.toContain('slugKeys');

    const stored = await bookingsRepo.findBookingById(parsed.booking.id);
    expect(stored?.bufferMinutes).toBe(10);
    // 45 minutes plus a 10 minute buffer: 10:00 to 10:55 locks four 15 minute blocks.
    expect(await slotLocksRepo.listSlotLocksForHolder(parsed.booking.id)).toHaveLength(4);
    const outbox = await emailOutboxRepo.listOutboxForBooking(parsed.booking.id);
    expect(outbox.map((m) => m.template).sort()).toEqual(['bookingConfirmed', 'ownerNewBooking']);
    expect(outbox.every((m) => m.status === 'pending')).toBe(true);
    expect(
      await db()
        .collection('auditLog')
        .countDocuments({ entityId: parsed.booking.id, action: 'booking.create' }),
    ).toBe(1);
  });

  it('a customer without email gets no customer message, only the owner alert', async () => {
    const res = await post(
      body({
        startAt: slotAt(WED, '11:00'),
        customer: { name: 'No Mail', phone: phone(), email: null },
      }),
    );
    expect(res.status).toBe(201);
    const id = createBookingResponseSchema.parse(res.body).booking.id;
    expect((await emailOutboxRepo.listOutboxForBooking(id)).map((m) => m.template)).toEqual([
      'ownerNewBooking',
    ]);
  });

  it('validation errors: missing key, bad phone, empty services, off-grid time, bad json, unknown service', async () => {
    const noKey = await call(server.baseUrl, 'POST', '/api/bookings', { body: body() });
    expect(noKey.status).toBe(400);
    const badPhone = await post(body({ customer: { name: 'X', phone: '12345', email: null } }));
    expect(badPhone.status).toBe(400);
    expect(apiErrorSchema.parse(badPhone.body).error.details?.[0]?.path).toBe('customer.phone');
    const noServices = await post(body({ serviceIds: [] }));
    expect(noServices.status).toBe(400);
    const offGrid = await post(body({ startAt: slotAt(WED, '10:05') }));
    expect(offGrid.status).toBe(400);
    expect(apiErrorSchema.parse(offGrid.body).error.details?.[0]?.path).toBe('startAt');
    const unknownService = await post(body({ serviceIds: [newId()] }));
    expect(unknownService.status).toBe(409);
    expect(apiErrorSchema.parse(unknownService.body).error.code).toBe('SERVICE_UNAVAILABLE');
    const dupService = await post(body({ serviceIds: [cutId, cutId] }));
    expect(dupService.status).toBe(400);
    const badJson = await fetch(`${server.baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
        'idempotency-key': idemKey(),
      },
      body: '{not json',
    });
    expect(badJson.status).toBe(400);
  });

  it('closed day, unknown chair, chair that does not do the service, and beauty with "any"', async () => {
    const closed = await post(body({ startAt: slotAt(SUN, '10:00') }));
    expect(apiErrorSchema.parse(closed.body).error.code).toBe('SHOP_CLOSED');
    const unknown = await post(body({ staff: 'nobody' }));
    expect(apiErrorSchema.parse(unknown.body).error.code).toBe('STAFF_UNAVAILABLE');
    const beauty = await post(body({ serviceIds: [serviceSeedId('silk-press')], staff: 'marcus' }));
    expect(apiErrorSchema.parse(beauty.body).error.code).toBe('STAFF_UNAVAILABLE');
    const anyBeauty = await post(
      body({
        serviceIds: [serviceSeedId('silk-press')],
        staff: 'any',
        startAt: slotAt(WED, '12:00'),
      }),
    );
    expect(anyBeauty.status).toBe(201);
    expect(createBookingResponseSchema.parse(anyBeauty.body).booking.staff.slug).toBe('dontrise');
    const past = await post(body({ startAt: '2020-01-01T15:00:00.000Z' }));
    expect(apiErrorSchema.parse(past.body).error.code).toBe('OUTSIDE_BOOKING_WINDOW');
  });

  it('the honeypot rejects bots without creating anything', async () => {
    const before = await db().collection('bookings').countDocuments();
    const res = await post(body({ startAt: slotAt(WED, '13:00'), website: 'http://spam.example' }));
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('BAD_REQUEST');
    expect(await db().collection('bookings').countDocuments()).toBe(before);
  });

  it('idempotent replay returns the same booking; the same key with another body is 422', async () => {
    const key = idemKey();
    const payload = body({ startAt: slotAt(WED, '14:00') });
    const first = await post(payload, { 'idempotency-key': key });
    expect(first.status).toBe(201);
    const replay = await post(payload, { 'idempotency-key': key });
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    expect(replay.body).toEqual(first.body);
    const id = createBookingResponseSchema.parse(first.body).booking.id;
    expect(
      await db()
        .collection('bookings')
        .countDocuments({
          referenceCode: createBookingResponseSchema.parse(first.body).booking.referenceCode,
        }),
    ).toBe(1);
    expect(await slotLocksRepo.listSlotLocksForHolder(id)).toHaveLength(3);
    const mismatch = await post({ ...payload, notes: 'different' }, { 'idempotency-key': key });
    expect(mismatch.status).toBe(422);
    expect(apiErrorSchema.parse(mismatch.body).error.code).toBe('IDEMPOTENCY_BODY_MISMATCH');
  });

  it('a conflict returns 409 SLOT_TAKEN with alternatives and writes nothing', async () => {
    const taken = await post(body({ startAt: slotAt(WED, '15:00'), staff: 'kris' }));
    expect(taken.status).toBe(201);
    const outboxBefore = await db().collection('emailOutbox').countDocuments();
    const locksBefore = await db().collection('slotLocks').countDocuments();
    const res = await post(body({ startAt: slotAt(WED, '15:15'), staff: 'kris' }));
    expect(res.status).toBe(409);
    const err = apiErrorSchema.parse(res.body).error;
    expect(err.code).toBe('SLOT_TAKEN');
    expect(err.alternatives?.length).toBeGreaterThan(0);
    expect(err.alternatives?.[0]?.staffId).toBe(staffSeedId('kris'));
    expect(new Date(err.alternatives?.[0]?.startAt ?? 0).getTime()).toBeGreaterThan(
      new Date(slotAt(WED, '15:15')).getTime(),
    );
    expect(await db().collection('emailOutbox').countDocuments()).toBe(outboxBefore);
    expect(await db().collection('slotLocks').countDocuments()).toBe(locksBefore);
  });

  it('the per-phone open booking limit stops a fourth upcoming booking', async () => {
    const myPhone = phone();
    for (const time of ['09:00', '10:00', '11:00']) {
      const res = await post(
        body({
          startAt: slotAt(THU, time),
          staff: 'marcus',
          customer: { name: 'Repeat', phone: myPhone, email: null },
        }),
      );
      expect(res.status).toBe(201);
    }
    const fourth = await post(
      body({
        startAt: slotAt(THU, '12:00'),
        staff: 'marcus',
        customer: { name: 'Repeat', phone: myPhone, email: null },
      }),
    );
    expect(fourth.status).toBe(409);
    expect(apiErrorSchema.parse(fourth.body).error.code).toBe('TOO_MANY_OPEN_BOOKINGS');
  });

  it('rate limits per IP and per phone', async () => {
    const ip = '203.0.113.77';
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await post(body({ startAt: slotAt(SUN, '10:00') }), { 'x-forwarded-for': ip });
      last = res.status;
    }
    expect(last).toBe(429);
    const limitedPhone = phone();
    for (let i = 0; i < 5; i += 1) {
      await post(
        body({
          startAt: slotAt(SUN, '10:00'),
          customer: { name: 'P', phone: limitedPhone, email: null },
        }),
        { 'x-forwarded-for': `198.51.100.${i + 1}` },
      );
    }
    const sixth = await post(
      body({
        startAt: slotAt(SUN, '10:00'),
        customer: { name: 'P', phone: limitedPhone, email: null },
      }),
      { 'x-forwarded-for': '198.51.100.99' },
    );
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('retry-after')).toMatch(/^\d+$/);
  });

  it('"any" falls through to the next chair when the first pick conflicts on the lock', async () => {
    const start = slotAt(THU, '15:00');
    const days = await call(
      server.baseUrl,
      'GET',
      `/api/availability?date=${THU}&serviceIds=${cutId}&staff=any`,
    );
    const slot = (days.body.slots as { startAt: string; staffId: string }[]).find(
      (s) => s.startAt === start,
    );
    expect(slot).toBeDefined();
    // Lock the fairness pick's chair directly so the engine still believes it is free.
    await slotLocksRepo.acquireSlotLocks(
      slot?.staffId ?? '',
      { start: new Date(start), end: new Date(new Date(start).getTime() + 15 * 60_000) },
      { holderType: 'timeBlock', holderId: newId() },
      NOW,
    );
    const res = await post(body({ startAt: start, staff: 'any' }));
    expect(res.status).toBe(201);
    const parsed = createBookingResponseSchema.parse(res.body);
    expect(parsed.booking.staff.id).not.toBe(slot?.staffId);
    expect(parsed.booking.staffRequested).toBe(false);
  });

  it('race: 25 parallel bookings for one chair and slot, exactly one wins and no lock is orphaned', async () => {
    const start = slotAt(THU, '16:00');
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        post(
          body({
            startAt: start,
            staff: 'kris',
            customer: { name: `Racer ${i}`, phone: phone(), email: null },
          }),
          { 'x-forwarded-for': `192.0.2.${i + 1}` },
        ),
      ),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(24);
    const krisId = staffSeedId('kris');
    const locks = await slotLocksRepo.listSlotLocksForStaff(krisId, {
      start: new Date(start),
      end: new Date(new Date(start).getTime() + 60 * 60_000),
    });
    expect(locks).toHaveLength(3);
    const winners = await bookingsRepo.listBookingsBetween(
      { start: new Date(start), end: new Date(new Date(start).getTime() + 60_000) },
      { staffId: krisId },
    );
    expect(winners).toHaveLength(1);
    for (const lock of locks) expect(lock.holderId).toBe(winners[0]?._id);
    // Nothing in slotLocks points at a booking that does not exist.
    const allLocks = await db()
      .collection<{ holderId: string; holderType: string }>('slotLocks')
      .find({ holderType: 'booking' })
      .toArray();
    const bookingIds = new Set(
      (
        await db()
          .collection<{ _id: string }>('bookings')
          .find({}, { projection: { _id: 1 } })
          .toArray()
      ).map((b) => b._id),
    );
    expect(allLocks.every((l) => bookingIds.has(l.holderId))).toBe(true);
    // Only one idempotency key completed; the rest were released.
    expect(await db().collection('idempotencyKeys').countDocuments({ status: 'inProgress' })).toBe(
      0,
    );
  });
});

describe('manage link', () => {
  async function book(overrides: Record<string, unknown> = {}) {
    const res = await post(body(overrides));
    expect(res.status).toBe(201);
    const parsed = createBookingResponseSchema.parse(res.body);
    const token = new URL(parsed.managePath, 'http://x').searchParams.get('token') ?? '';
    return { parsed, token };
  }

  it('GET returns the summary with cutoff flags', async () => {
    const { parsed, token } = await book({ startAt: slotAt(WED, '16:00'), staff: 'dee' });
    const res = await call(
      server.baseUrl,
      'GET',
      `/api/bookings/manage?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      canCancel: true,
      canReschedule: true,
      cutoffs: { cancelMinutes: 120, rescheduleMinutes: 120 },
    });
    expect((res.body.booking as { id: string }).id).toBe(parsed.booking.id);
  });

  it('tampered, expired, unknown, superseded and cancelled tokens have distinct codes', async () => {
    const { token } = await book({ startAt: slotAt(WED, '17:00'), staff: 'dee' });
    const tampered = await call(
      server.baseUrl,
      'GET',
      `/api/bookings/manage?token=${token.slice(0, -3)}abc`,
    );
    expect(apiErrorSchema.parse(tampered.body).error.code).toBe('INVALID_TOKEN');
    expect(tampered.status).toBe(403);
    const expired = createManageToken(TEST_MANAGE_SECRET, {
      bookingId: newId(),
      version: 1,
      expiresAt: new Date(Date.now() - 1000),
    });
    const expiredRes = await call(server.baseUrl, 'GET', `/api/bookings/manage?token=${expired}`);
    expect(apiErrorSchema.parse(expiredRes.body).error.code).toBe('TOKEN_EXPIRED');
    const ghost = createManageToken(TEST_MANAGE_SECRET, {
      bookingId: newId(),
      version: 1,
      expiresAt: new Date(Date.now() + 100_000),
    });
    expect((await call(server.baseUrl, 'GET', `/api/bookings/manage?token=${ghost}`)).status).toBe(
      404,
    );
    const cancel = await call(server.baseUrl, 'POST', '/api/bookings/manage/cancel', {
      body: { token, reason: 'Change of plans' },
    });
    expect(cancel.status).toBe(200);
    expect((cancel.body.booking as { status: string }).status).toBe('cancelled');
    const again = await call(
      server.baseUrl,
      'GET',
      `/api/bookings/manage?token=${encodeURIComponent(token)}`,
    );
    expect(again.status).toBe(410);
    expect(apiErrorSchema.parse(again.body).error.code).toBe('BOOKING_CANCELLED');
    const cancelAgain = await call(server.baseUrl, 'POST', '/api/bookings/manage/cancel', {
      body: { token },
    });
    expect(apiErrorSchema.parse(cancelAgain.body).error.code).toBe('BOOKING_CANCELLED');
  });

  it('cancel releases the locks in the same transaction and queues the cancel emails', async () => {
    const { parsed, token } = await book({ startAt: slotAt(THU, '09:00'), staff: 'dee' });
    expect(await slotLocksRepo.listSlotLocksForHolder(parsed.booking.id)).toHaveLength(3);
    const res = await call(server.baseUrl, 'POST', '/api/bookings/manage/cancel', {
      body: { token, reason: 'Sick' },
    });
    expect(res.status).toBe(200);
    expect(await slotLocksRepo.listSlotLocksForHolder(parsed.booking.id)).toHaveLength(0);
    const stored = await bookingsRepo.findBookingById(parsed.booking.id);
    expect(stored?.cancellation).toMatchObject({ by: 'customer', reason: 'Sick' });
    const templates = (await emailOutboxRepo.listOutboxForBooking(parsed.booking.id))
      .map((m) => m.template)
      .sort();
    expect(templates).toEqual([
      'bookingCancelled',
      'bookingConfirmed',
      'ownerBookingCancelled',
      'ownerNewBooking',
    ]);
    expect(
      await db()
        .collection('auditLog')
        .countDocuments({ entityId: parsed.booking.id, action: 'booking.cancel' }),
    ).toBe(1);
    // The slot is bookable again.
    const rebook = await post(body({ startAt: slotAt(THU, '09:00'), staff: 'dee' }));
    expect(rebook.status).toBe(201);
  });

  it('reschedule into an overlapping time on the same chair works and invalidates the old link', async () => {
    const { parsed, token } = await book({
      serviceIds: [cutId, beardId],
      startAt: slotAt(THU, '11:00'),
      staff: 'dee',
    });
    const res = await call(server.baseUrl, 'POST', '/api/bookings/manage/reschedule', {
      body: { token, startAt: slotAt(THU, '11:15') },
    });
    expect(res.status).toBe(200);
    const moved = createBookingResponseSchema.parse(res.body);
    expect(moved.booking.startAt).toBe(slotAt(THU, '11:15'));
    expect(moved.booking.sequence).toBe(2);
    expect(moved.booking.staff.slug).toBe('dee');
    const locks = await slotLocksRepo.listSlotLocksForHolder(parsed.booking.id);
    expect(locks.map((l) => l.slotStart.toISOString())).toEqual([
      slotAt(THU, '11:15'),
      slotAt(THU, '11:30'),
      slotAt(THU, '11:45'),
      slotAt(THU, '12:00'),
    ]);
    const old = await call(
      server.baseUrl,
      'GET',
      `/api/bookings/manage?token=${encodeURIComponent(token)}`,
    );
    expect(apiErrorSchema.parse(old.body).error.code).toBe('INVALID_TOKEN');
    const newToken = new URL(moved.managePath, 'http://x').searchParams.get('token') ?? '';
    expect(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/bookings/manage?token=${encodeURIComponent(newToken)}`,
        )
      ).status,
    ).toBe(200);
    const templates = (await emailOutboxRepo.listOutboxForBooking(parsed.booking.id))
      .map((m) => m.template)
      .sort();
    expect(templates).toEqual([
      'bookingConfirmed',
      'bookingRescheduled',
      'ownerBookingRescheduled',
      'ownerNewBooking',
    ]);
    // Moving onto someone else's time is refused and the booking stays put.
    const blocker = await post(body({ startAt: slotAt(THU, '14:00'), staff: 'dee' }));
    expect(blocker.status).toBe(201);
    const refused = await call(server.baseUrl, 'POST', '/api/bookings/manage/reschedule', {
      body: { token: newToken, startAt: slotAt(THU, '14:00') },
    });
    expect(refused.status).toBe(409);
    expect(apiErrorSchema.parse(refused.body).error.code).toBe('SLOT_TAKEN');
    expect((await bookingsRepo.findBookingById(parsed.booking.id))?.startAt.toISOString()).toBe(
      slotAt(THU, '11:15'),
    );
    expect(await slotLocksRepo.listSlotLocksForHolder(parsed.booking.id)).toHaveLength(4);
    const same = await call(server.baseUrl, 'POST', '/api/bookings/manage/reschedule', {
      body: { token: newToken, startAt: slotAt(THU, '11:15') },
    });
    expect(same.status).toBe(400);
  });

  it('reschedule can switch to "any" and lands on another chair', async () => {
    const { token } = await book({ startAt: slotAt(THU, '13:00'), staff: 'marcus' });
    const res = await call(server.baseUrl, 'POST', '/api/bookings/manage/reschedule', {
      body: { token, startAt: slotAt(THU, '13:00'), staff: 'any' },
    });
    expect(res.status).toBe(200);
    expect(createBookingResponseSchema.parse(res.body).booking.staffRequested).toBe(false);
  });

  it('the cutoff blocks cancel and reschedule close to the start', async () => {
    const soon = new Date(Date.now() + 60 * 60_000);
    soon.setUTCMinutes(0, 0, 0);
    const dee = await staffRepo.findStaffById(staffSeedId('dee'));
    const doc = await bookingsRepo.insertBooking(
      bookingInput({
        staffId: dee?._id ?? '',
        startAt: soon,
        endAt: new Date(soon.getTime() + 30 * 60_000),
      }),
      NOW,
    );
    const token = createManageToken(TEST_MANAGE_SECRET, {
      bookingId: doc._id,
      version: 1,
      expiresAt: new Date(Date.now() + 10 * 24 * 3600_000),
    });
    const view = await call(server.baseUrl, 'GET', `/api/bookings/manage?token=${token}`);
    expect(view.body).toMatchObject({ canCancel: false, canReschedule: false });
    const cancel = await call(server.baseUrl, 'POST', '/api/bookings/manage/cancel', {
      body: { token },
    });
    expect(apiErrorSchema.parse(cancel.body).error.code).toBe('BOOKING_NOT_CANCELLABLE');
    const move = await call(server.baseUrl, 'POST', '/api/bookings/manage/reschedule', {
      body: { token, startAt: slotAt(THU, '10:00') },
    });
    expect(apiErrorSchema.parse(move.body).error.code).toBe('BOOKING_NOT_RESCHEDULABLE');
  });
});
