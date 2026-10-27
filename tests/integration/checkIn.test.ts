import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { weeklyHoursRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import type { WeekHours } from '../../shared/schemas/common';
import { maskName, matchesQuery } from '../../server/services/checkIn';
import { serviceSeedId, staffSeedId } from '../../seed/shop';
import {
  checkInArrivedResponseSchema,
  checkInLookupResponseSchema,
} from '../../shared/api/checkIn';
import { SHOP_TIMEZONE } from '../../shared/lib/constants';
import { createLogin, sessionCookie, teamCookie } from '../helpers/auth';
import { call, nextDate, slotAt, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
let leeCookie: string;
const cut = serviceSeedId('haircut');
const lee = staffSeedId('lee');
const drew = staffSeedId('drew');
const nelly = staffSeedId('nelly');
const dontrise = staffSeedId('dontrise');

const as =
  (cookie: string) =>
  (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    call(server.baseUrl, method, path, {
      headers: { cookie, ...headers },
      ...(body === undefined ? {} : { body }),
    });
let owner: ReturnType<typeof as>;
let barber: ReturnType<typeof as>;

/** A confirmed booking later today (walk-in source skips the grid and lead time). */
async function bookToday(name: string, phone: string, staffId: string, minutesAhead: number) {
  const startAt = DateTime.now().setZone(SHOP_TIMEZONE).plus({ minutes: minutesAhead }).toISO();
  const res = await owner(
    'POST',
    '/api/admin/bookings',
    {
      source: 'walkIn',
      serviceIds: [cut],
      staff: staffId,
      startAt,
      customer: { name, phone, email: null },
      notifyCustomer: false,
    },
    { 'Idempotency-Key': `checkin-${name}-${String(minutesAhead)}` },
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { booking: { id: string } }).booking.id;
}

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
  const ownerLogin = await createLogin({ role: 'owner', staffId: dontrise });
  ownerCookie = await sessionCookie(ownerLogin._id);
  leeCookie = await teamCookie(lee);
  owner = as(ownerCookie);
  barber = as(leeCookie);
});
afterAll(async () => {
  vi.useRealTimers();
  await server.close();
});

describe('the front desk lookup', () => {
  it('masks names, hides phones and emails, and matches by name or the last 4', () => {
    expect(maskName('Chris Martin')).toBe('Chris M.');
    expect(maskName('Chris')).toBe('Chris');
    expect(maskName('  mary ann  lee ')).toBe('mary L.');
    const b = {
      customer: { name: 'Chris Martin', phone: '+12155552101' },
    } as Parameters<typeof matchesQuery>[0];
    expect(matchesQuery(b, 'chr')).toBe(true);
    expect(matchesQuery(b, 'mart')).toBe(true);
    expect(matchesQuery(b, '2101')).toBe(true);
    expect(matchesQuery(b, '555-2101')).toBe(true);
    expect(matchesQuery(b, '9999')).toBe(false);
    expect(matchesQuery(b, 'ris')).toBe(false);
  });

  it("returns only today's confirmed bookings with masked details, and the tap marks arrived", async () => {
    const chris = await bookToday('Chris Martin', '2155553101', drew, 20);
    const cancelled = await bookToday('Chris Cancelled', '2155553102', nelly, 40);
    await owner('POST', `/api/admin/bookings/${cancelled}/cancel`, { reason: 'test' });

    const found = checkInLookupResponseSchema.parse(
      (await owner('GET', '/api/admin/checkin/lookup?q=chris')).body,
    );
    expect(found.matches.map((m) => m.name)).toEqual(['Chris M.']);
    const match = found.matches[0];
    expect(match).toMatchObject({ id: chris, staffName: 'Drew', arrived: false });
    expect(JSON.stringify(found)).not.toMatch(/2155553101|@/);

    const byDigits = checkInLookupResponseSchema.parse(
      (await owner('GET', '/api/admin/checkin/lookup?q=3101')).body,
    );
    expect(byDigits.matches.map((m) => m.id)).toEqual([chris]);

    const arrived = checkInArrivedResponseSchema.parse(
      (await owner('POST', `/api/admin/checkin/${chris}/arrived`, {})).body,
    );
    expect(arrived.match).toMatchObject({ id: chris, name: 'Chris M.', arrived: true });
    const stored = await db()
      .collection<{ _id: string; arrivedAt: Date | null }>('bookings')
      .findOne({ _id: chris });
    expect(stored?.arrivedAt).not.toBeNull();
    // Tapping again is harmless.
    const again = await owner('POST', `/api/admin/checkin/${chris}/arrived`, {});
    expect(again.status).toBe(200);

    const empty = await owner('GET', '/api/admin/checkin/lookup?q=');
    expect(empty.status).toBe(400);
  });

  it('a barber session sees and marks only its own chair', async () => {
    const mine = await bookToday('Lee Client', '2155553201', lee, 60);
    const other = await bookToday('Drew Client', '2155553202', dontrise, 80);
    const found = checkInLookupResponseSchema.parse(
      (await barber('GET', '/api/team/checkin/lookup?q=client')).body,
    );
    expect(found.matches.map((m) => m.id)).toEqual([mine]);
    const refused = await barber('POST', `/api/team/checkin/${other}/arrived`, {});
    expect(refused.status).toBe(404);
    const ok = await barber('POST', `/api/team/checkin/${mine}/arrived`, {});
    expect(ok.status).toBe(200);
  });
});
