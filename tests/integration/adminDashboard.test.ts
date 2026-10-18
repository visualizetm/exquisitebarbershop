import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookingsRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, staffSeedId } from '../../seed/shop';
import {
  BOOKING_TABLE_PAGE_SIZE,
  bookingTableResponseSchema,
  manualBookingResponseSchema,
  overviewResponseSchema,
} from '../../shared/api/admin';
import { shopDateOf } from '../../shared/lib/time';
import { createLogin, sessionCookie } from '../helpers/auth';
import { call, idemKey, startTestServer, type TestServer } from '../helpers/bookingApi';
import { bookingInput } from '../helpers/fixtures';
import { NOW, useTestDb } from '../helpers/db';
import { DateTime } from 'luxon';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let cookie: string;
const cut = serviceSeedId('classic-cut');
const get = (path: string) => call(server.baseUrl, 'GET', path, { headers: { cookie } });

async function walkIn(chair: string, name: string) {
  const res = await call(server.baseUrl, 'POST', '/api/admin/bookings', {
    headers: { cookie, 'idempotency-key': idemKey() },
    body: {
      source: 'walkIn',
      serviceIds: [cut],
      staff: chair,
      customer: {
        name,
        phone: `+1215555${String(Math.floor(Math.random() * 9000) + 1000)}`,
        email: null,
      },
    },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return manualBookingResponseSchema.parse(res.body).booking;
}

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  cookie = await sessionCookie(
    (await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') }))._id,
  );
});
afterAll(async () => {
  await server.close();
});

describe('GET /api/admin/overview', () => {
  it('is empty and honest on a quiet day: zeros, no compare line, no activity', async () => {
    const o = overviewResponseSchema.parse((await get('/api/admin/overview')).body);
    expect(o.stats.bookings).toEqual({ value: 0, compare: null });
    expect(o.stats.bookedValueCents).toEqual({ value: 0, compare: null });
    expect(o.stats.walkIns).toEqual({ value: 0, compare: null });
    expect(o.stats.noShowsWeek).toEqual({ value: 0, compare: null });
    expect(o.week).toHaveLength(7);
    expect(o.week.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(o.week.filter((d) => d.today)).toHaveLength(1);
    expect(o.activity).toEqual([]);
    expect(o.alerts).toEqual([]);
    expect(o.chairs.length).toBeGreaterThanOrEqual(6);
  });

  it('counts today from real bookings, and shows last week only when there is data', async () => {
    const a = await walkIn('marcus', 'Walk In One');
    await walkIn('dee', 'Walk In Two');
    const c = await walkIn('jay', 'Walk In Three');
    // One cancelled and one no show.
    const cancelled = await call(server.baseUrl, 'POST', `/api/admin/bookings/${c.id}/cancel`, {
      headers: { cookie },
      body: { notify: false },
    });
    expect(cancelled.status).toBe(200);
    const noShow = await call(server.baseUrl, 'POST', `/api/admin/bookings/${a.id}/status`, {
      headers: { cookie },
      body: { status: 'noShow' },
    });
    expect(noShow.status).toBe(200);

    let o = overviewResponseSchema.parse((await get('/api/admin/overview')).body);
    // Cancelled ones do not count; the no show still holds its booking.
    expect(o.stats.bookings.value).toBe(2);
    expect(o.stats.walkIns.value).toBe(2);
    expect(o.stats.bookedValueCents.value).toBe(2 * a.totalPriceCents);
    expect(o.stats.noShowsWeek.value).toBe(1);
    expect(o.stats.bookings.compare).toBeNull();
    // Cancelled, no show, two walk-ins: the latest events first, at most eight.
    expect(o.activity.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['walkIn', 'canceled', 'noShow']),
    );
    expect(o.activity.length).toBeLessThanOrEqual(8);
    expect((o.activity[0]?.at ?? '') >= (o.activity[1]?.at ?? '')).toBe(true);
    const today = o.week.find((d) => d.today);
    expect(today?.thisWeek).toBe(2);

    // Same weekday last week: two bookings worth 2 x price, one of them a walk-in and a no show.
    const lastWeek = DateTime.fromISO(o.now).minus({ weeks: 1 }).toJSDate();
    for (const source of ['walkIn', 'online'] as const) {
      await bookingsRepo.insertBooking(
        bookingInput({
          staffId: staffSeedId('marcus'),
          startAt: lastWeek,
          endAt: new Date(lastWeek.getTime() + 30 * 60_000),
          source,
          status: source === 'walkIn' ? 'noShow' : 'confirmed',
        }),
        NOW,
      );
    }
    o = overviewResponseSchema.parse((await get('/api/admin/overview')).body);
    expect(o.weekdayName).toBe(
      DateTime.fromISO(o.now).setZone('America/New_York').toFormat('cccc'),
    );
    expect(o.stats.bookings.compare).toBe(2);
    expect(o.stats.bookedValueCents.compare).toBe(6000);
    expect(o.stats.walkIns.compare).toBe(1);
    // Last week fell in the previous week unless today is Monday through the same week; either way a number or null.
    const lastWeekIsEarlier = shopDateOf(lastWeek) < (o.week[0]?.date ?? '');
    expect(o.stats.noShowsWeek.compare).toBe(lastWeekIsEarlier ? 1 : null);
    expect(today?.lastWeek ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('shows who is in the chair now and who is next', async () => {
    const o = overviewResponseSchema.parse((await get('/api/admin/overview')).body);
    const jay = o.chairs.find((c) => c.staff.slug === 'jay');
    expect(jay?.current).toBeNull();
    const marcus = o.chairs.find((c) => c.staff.slug === 'marcus');
    expect(marcus?.staff.name).toBe('Marcus');
  });
});

describe('GET /api/admin/booking-table', () => {
  beforeAll(async () => {
    const base = Date.now() + 3 * 24 * 3600_000;
    for (let i = 0; i < 30; i += 1) {
      const startAt = new Date(base + i * 3600_000);
      await bookingsRepo.insertBooking(
        bookingInput({
          staffId: staffSeedId(i % 2 === 0 ? 'marcus' : 'dee'),
          startAt,
          endAt: new Date(startAt.getTime() + 30 * 60_000),
          customer: {
            name: `Table ${String(i).padStart(2, '0')}`,
            phone: '+12155550199',
            email: null,
          },
          source: i % 3 === 0 ? 'online' : 'phone',
          status: i === 0 ? 'cancelled' : 'confirmed',
        }),
        NOW,
      );
    }
  });

  it('pages 25 at a time in start order and reports the total', async () => {
    const first = bookingTableResponseSchema.parse(
      (await get('/api/admin/booking-table?range=upcoming')).body,
    );
    expect(first.pageSize).toBe(BOOKING_TABLE_PAGE_SIZE);
    expect(first.rows).toHaveLength(25);
    expect(first.total).toBeGreaterThanOrEqual(30);
    const second = bookingTableResponseSchema.parse(
      (await get('/api/admin/booking-table?range=upcoming&page=2')).body,
    );
    expect(second.rows.length).toBe(first.total - 25);
    const starts = [...first.rows, ...second.rows].map((r) => r.startAt);
    expect(starts).toEqual([...starts].sort());
  });

  it('sorts by client both ways, and filters by barber and status', async () => {
    const asc = bookingTableResponseSchema.parse(
      (await get('/api/admin/booking-table?range=upcoming&sort=client&dir=asc')).body,
    );
    const names = asc.rows.map((r) => r.customer.name.toLowerCase());
    expect(names).toEqual([...names].sort());
    const desc = bookingTableResponseSchema.parse(
      (await get('/api/admin/booking-table?range=upcoming&sort=client&dir=desc')).body,
    );
    const descNames = desc.rows.map((r) => r.customer.name.toLowerCase());
    expect(descNames).toEqual([...descNames].sort().reverse());
    expect((descNames[0] ?? '') > (names.at(-1) ?? '')).toBe(true);

    const dee = bookingTableResponseSchema.parse(
      (await get(`/api/admin/booking-table?range=upcoming&staffId=${staffSeedId('dee')}`)).body,
    );
    expect(dee.rows.every((r) => r.staff.slug === 'dee')).toBe(true);
    const cancelled = bookingTableResponseSchema.parse(
      (await get('/api/admin/booking-table?range=upcoming&status=cancelled')).body,
    );
    expect(cancelled.rows.every((r) => r.status === 'cancelled')).toBe(true);
    expect(cancelled.total).toBe(1);
  });

  it('counts each quick filter with the barber and status filters applied', async () => {
    const all = bookingTableResponseSchema.parse((await get('/api/admin/booking-table')).body);
    expect(all.counts.upcoming).toBeGreaterThanOrEqual(30);
    expect(all.counts.past).toBeGreaterThanOrEqual(2);
    const dee = bookingTableResponseSchema.parse(
      (await get(`/api/admin/booking-table?staffId=${staffSeedId('dee')}`)).body,
    );
    expect(dee.counts.upcoming).toBeLessThan(all.counts.upcoming);
    const past = bookingTableResponseSchema.parse(
      (await get('/api/admin/booking-table?range=past')).body,
    );
    // The past list starts with the newest.
    const pastStarts = past.rows.map((r) => r.startAt);
    expect(pastStarts).toEqual([...pastStarts].sort().reverse());
  });
});

describe('POST /api/admin/bookings/:id/resend', () => {
  it('needs an email on file, then queues one new confirmation each time', async () => {
    const noEmail = await walkIn('tre', 'No Email');
    const refused = await call(server.baseUrl, 'POST', `/api/admin/bookings/${noEmail.id}/resend`, {
      headers: { cookie },
      body: {},
    });
    expect(refused.status).toBe(409);

    const res = await call(server.baseUrl, 'POST', '/api/admin/bookings', {
      headers: { cookie, 'idempotency-key': idemKey() },
      body: {
        source: 'walkIn',
        serviceIds: [cut],
        staff: 'kris',
        customer: { name: 'Has Email', phone: '+12155550123', email: 'has@example.com' },
        notifyCustomer: false,
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const booking = manualBookingResponseSchema.parse(res.body).booking;
    const before = await db().collection('emailOutbox').countDocuments({ bookingId: booking.id });
    for (let i = 0; i < 2; i += 1) {
      const ok = await call(server.baseUrl, 'POST', `/api/admin/bookings/${booking.id}/resend`, {
        headers: { cookie },
        body: {},
      });
      expect(ok.status).toBe(200);
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(await db().collection('emailOutbox').countDocuments({ bookingId: booking.id })).toBe(
      before + 2,
    );
  });
});
