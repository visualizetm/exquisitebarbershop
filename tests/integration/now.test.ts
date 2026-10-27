import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closuresRepo, timeBlocksRepo, weeklyHoursRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import type { WeekHours } from '../../shared/schemas/common';
import { serviceSeedId, staffSeedId } from '../../seed/shop';
import { nowResponseSchema } from '../../shared/api/admin';
import { lineResponseSchema } from '../../shared/api/line';
import { shopDateOf, shopDayBounds } from '../../shared/lib/time';
import { apiErrorSchema } from '../../shared/api/errors';
import { createLogin, sessionCookie, teamCookie } from '../helpers/auth';
import { call, nextDate, slotAt, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
let drewCookie: string;
const cut = serviceSeedId('haircut');
const drew = staffSeedId('drew');
const nelly = staffSeedId('nelly');
const lee = staffSeedId('lee');
let n = 0;
const phone = () => `215555${String(3000 + (n += 1))}`;
const key = () => `now-${String(Date.now())}-${String((n += 1))}`;

function as(cookie: string) {
  return (method: string, path: string, body?: unknown) =>
    call(server.baseUrl, method, path, {
      headers: { cookie, 'idempotency-key': key() },
      ...(body === undefined ? {} : { body }),
    });
}
const owner = (method: string, path: string, body?: unknown) => as(ownerCookie)(method, path, body);
const barber = (method: string, path: string, body?: unknown) => as(drewCookie)(method, path, body);
const codeOf = (body: unknown) => apiErrorSchema.parse(body).error.code;
const customer = (name: string) => ({ name, phone: phone(), email: null });

// Open around the clock every day, and the clock frozen at 13:00 shop time on the next Tuesday
// (only Date is faked), so NOW and the line behave the same whenever this file runs (D12-88).
const allDay = { start: '00:00', end: '23:59' };
const ALWAYS: WeekHours = {
  mon: [allDay],
  tue: [allDay],
  wed: [allDay],
  thu: [allDay],
  fri: [allDay],
  sat: [allDay],
  sun: [allDay],
};
const FROZEN_NOW = new Date(slotAt(nextDate(2, 1), '13:00'));
async function openAlways(): Promise<void> {
  await weeklyHoursRepo.setShopHours(ALWAYS, new Date());
  for (const key of ['lee', 'nelly', 'drew', 'dontrise', 'iniya'] as const)
    await weeklyHoursRepo.setStaffHours(staffSeedId(key), ALWAYS, new Date());
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: FROZEN_NOW, shouldAdvanceTime: true });
  await runSeed(db(), NOW);
  await openAlways();
  server = await startTestServer();
  const ownerLogin = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  ownerCookie = await sessionCookie(ownerLogin._id);
  drewCookie = await teamCookie(drew);
});
afterAll(async () => {
  vi.useRealTimers();
  await server.close();
});

describe('NOW', () => {
  it('books this minute when the chair is free: walk-in source, arrivedAt set, slots locked, off the grid', async () => {
    const res = await owner('POST', '/api/admin/now', {
      serviceIds: [cut],
      staffId: lee,
      customer: customer('Now Free'),
    });
    expect(res.status).toBe(201);
    const done = nowResponseSchema.parse(res.body);
    expect(done.kind).toBe('booking');
    if (done.kind !== 'booking') return;
    expect(done.booking).toMatchObject({
      source: 'walkIn',
      status: 'confirmed',
      staff: { id: lee },
    });
    expect(done.booking.arrivedAt).not.toBeNull();
    // Starts at the current minute, whatever the 15 minute grid says.
    expect(Math.abs(new Date(done.booking.startAt).getTime() - Date.now())).toBeLessThan(90_000);
    const locks = await db()
      .collection<{ holderId: string }>('slotLocks')
      .countDocuments({ holderId: done.booking.id });
    expect(locks).toBeGreaterThan(0);
  });

  it('joins the line when the chair is busy, and makes no booking', async () => {
    const before = await db().collection('bookings').countDocuments({ staffId: lee });
    const res = await owner('POST', '/api/admin/now', {
      serviceIds: [cut],
      staffId: lee,
      customer: customer('Now Busy'),
    });
    expect(res.status).toBe(201);
    const done = nowResponseSchema.parse(res.body);
    expect(done.kind).toBe('line');
    if (done.kind !== 'line') return;
    expect(done.walkIn).toMatchObject({ status: 'waiting', staffId: lee, name: 'Now Busy' });
    expect(done.walkIn.estimate.kind).toBe('about');
    expect(await db().collection('bookings').countDocuments({ staffId: lee })).toBe(before);
  });

  it('two NOWs for one chair at once: one booking, the other in the line, never two bookings', async () => {
    const results = await Promise.all(
      ['Race A', 'Race B'].map((name) =>
        barber('POST', '/api/team/now', { serviceIds: [cut], customer: customer(name) }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const kinds = results.map((r) => nowResponseSchema.parse(r.body).kind).sort();
    expect(kinds).toEqual(['booking', 'line']);
    const bookings = await db()
      .collection('bookings')
      .countDocuments({ staffId: drew, source: 'walkIn', status: 'confirmed' });
    expect(bookings).toBe(1);
  });

  it('a barber lands on their own chair whatever staffId says, and the public API never books off the grid', async () => {
    // Drew is busy now (the race above), so this joins Drew's line even when it asks for Lee.
    const res = await barber('POST', '/api/team/now', {
      serviceIds: [cut],
      staffId: lee,
      customer: customer('Own Chair'),
    });
    const done = nowResponseSchema.parse(res.body);
    expect(done.kind).toBe('line');
    if (done.kind === 'line') expect(done.walkIn.staffId).toBe(drew);

    // The public booking API: a start off the 15 minute grid is refused, and a walk-in source is
    // not a thing it knows.
    const offGrid = new Date(Math.floor(Date.now() / 60_000) * 60_000 + 7 * 60_000).toISOString();
    const pub = await call(server.baseUrl, 'POST', '/api/bookings', {
      headers: { 'idempotency-key': key() },
      body: {
        serviceIds: [cut],
        staff: 'nelly',
        startAt: offGrid,
        customer: customer('Public Now'),
        source: 'walkIn',
        arrived: true,
      },
    });
    expect([400, 409]).toContain(pub.status);
    expect(['VALIDATION_ERROR', 'OUTSIDE_BOOKING_WINDOW', 'SLOT_TAKEN', 'SHOP_CLOSED']).toContain(
      codeOf(pub.body),
    );
    expect(
      await db().collection('bookings').countDocuments({ 'customer.name': 'Public Now' }),
    ).toBe(0);
    // And a public NOW route does not exist.
    const none = await call(server.baseUrl, 'POST', '/api/now', {
      body: { serviceIds: [cut], customer: customer('Nobody') },
    });
    expect(none.status).toBe(404);
    // A grid time for the test's sake, so the helper imports stay used.
    expect(slotAt(nextDate(3, 3), '10:00')).toMatch(/T/);
  });

  it('refuses NOW and the line when the shop is closed, and says when it opens', async () => {
    const today = shopDateOf(new Date());
    const closure = await closuresRepo.insertClosure(
      { date: today, kind: 'closed', intervals: [], label: 'Test closure' },
      new Date(),
    );
    try {
      const now = await owner('POST', '/api/admin/now', {
        serviceIds: [cut],
        staffId: drew,
        customer: customer('Closed Now'),
      });
      expect(now.status).toBe(409);
      expect(codeOf(now.body)).toBe('SHOP_CLOSED');
      expect((now.body as { error: { message: string } }).error.message).toMatch(
        /^The shop is closed right now\. Opens /,
      );
      const line = await owner('POST', '/api/admin/line', {
        name: 'Closed Line',
        phone: phone(),
        serviceIds: [cut],
        staffId: null,
      });
      expect(line.status).toBe(409);
      expect(codeOf(line.body)).toBe('SHOP_CLOSED');
      const view = lineResponseSchema.parse((await owner('GET', '/api/admin/line')).body);
      expect(view.firstAvailable.kind).toBe('closed');
      expect(view.chairs.every((c) => c.gate.kind === 'closed')).toBe(true);
      expect(await db().collection('walkIns').countDocuments({ name: 'Closed Line' })).toBe(0);
    } finally {
      await closuresRepo.deleteClosure(closure._id);
    }
  });

  it('refuses a barber who is off today, flags anyone already waiting for them, and never drops them', async () => {
    // Somebody joins Lee's line while Lee is in; then Lee takes the day off.
    const waiting = await owner('POST', '/api/admin/line', {
      name: 'Waits For Lee',
      phone: phone(),
      serviceIds: [cut],
      staffId: lee,
    });
    expect(waiting.status).toBe(201);
    const bounds = shopDayBounds(shopDateOf(new Date()));
    const block = await timeBlocksRepo.insertTimeBlock(
      {
        staffId: lee,
        kind: 'dayOff',
        startAt: bounds.start,
        endAt: bounds.end,
        reason: null,
        createdBy: { type: 'owner', userId: null, staffId: null },
      },
      new Date(),
    );
    try {
      const now = await owner('POST', '/api/admin/now', {
        serviceIds: [cut],
        staffId: lee,
        customer: customer('Lee Off'),
      });
      expect(now.status).toBe(409);
      expect(codeOf(now.body)).toBe('BARBER_OFF');
      expect((now.body as { error: { message: string } }).error.message).toBe('Lee is off today.');
      const view = lineResponseSchema.parse((await owner('GET', '/api/admin/line')).body);
      const entry = view.line.find((w) => w.name === 'Waits For Lee');
      expect(entry?.flag).toBe('Lee is off. Move or mark left');
      expect(entry?.status).toBe('waiting');
      expect(view.chairs.find((c) => c.staffId === lee)?.gate).toEqual({
        kind: 'off',
        text: 'Lee is off today.',
      });
      // First available is still open: somebody else is in.
      expect(view.firstAvailable.kind).toBe('open');
    } finally {
      await timeBlocksRepo.deleteTimeBlock(block._id);
    }
  });

  it('a cut marked done early gives the rest of its time back, so the next NOW lands in the chair', async () => {
    const first = nowResponseSchema.parse(
      (
        await owner('POST', '/api/admin/now', {
          serviceIds: [cut],
          staffId: nelly,
          customer: customer('Done Early'),
        })
      ).body,
    );
    expect(first.kind).toBe('booking');
    if (first.kind !== 'booking') return;
    const done = await owner('POST', `/api/admin/bookings/${first.booking.id}/status`, {
      status: 'completed',
      notify: false,
    });
    expect(done.status).toBe(200);
    const again = nowResponseSchema.parse(
      (
        await owner('POST', '/api/admin/now', {
          serviceIds: [cut],
          staffId: nelly,
          customer: customer('Right After'),
        })
      ).body,
    );
    expect(again.kind).toBe('booking');
    // Undoing the first one now fails: its time belongs to the second.
    const undo = await owner('POST', `/api/admin/bookings/${first.booking.id}/status`, {
      status: 'confirmed',
      notify: false,
    });
    expect(undo.status).toBe(409);
    expect(codeOf(undo.body)).toBe('SLOT_TAKEN');
  });
});
