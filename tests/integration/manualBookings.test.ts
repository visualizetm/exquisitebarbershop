import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookingsRepo, emailOutboxRepo, slotLocksRepo, weeklyHoursRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, staffSeedId } from '../../seed/shop';
import { manualBookingResponseSchema } from '../../shared/api/admin';
import { apiErrorSchema } from '../../shared/api/errors';
import {
  ceilToStep,
  addMinutes,
  shopDateOf,
  shopDayStart,
  shopLocalToUtc,
} from '../../shared/lib/time';
import type { WeekHours } from '../../shared/schemas/common';
import { createLogin, sessionCookie } from '../helpers/auth';
import {
  bookPublic,
  call,
  idemKey,
  phone,
  slotAt,
  startTestServer,
  type TestServer,
} from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
const cut = serviceSeedId('haircut');
const lee = staffSeedId('lee');

// Open around the clock every day, so tests about "now" behave the same whenever they run.
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

const asOwner = (
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  call(server.baseUrl, method, path, {
    headers: { cookie: ownerCookie, ...headers },
    ...(body === undefined ? {} : { body }),
  });

function manual(body: Record<string, unknown>, key = idemKey()) {
  return asOwner(
    'POST',
    '/api/admin/bookings',
    {
      serviceIds: [cut],
      customer: { name: 'Phone Customer', phone: phone(), email: 'phone@example.com' },
      ...body,
    },
    { 'idempotency-key': key },
  );
}

/** The next grid start at least `minutes` from now. */
function startIn(minutes: number): string {
  return ceilToStep(addMinutes(new Date(), minutes), 15).toISOString();
}

beforeAll(async () => {
  await runSeed(db(), NOW);
  await weeklyHoursRepo.setShopHours(ALWAYS, new Date());
  for (const key of ['lee', 'nelly', 'drew', 'dontrise'])
    await weeklyHoursRepo.setStaffHours(staffSeedId(key), ALWAYS, new Date());
  server = await startTestServer();
  const owner = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  ownerCookie = await sessionCookie(owner._id);
});
afterAll(async () => {
  await server.close();
});

describe('phone bookings', () => {
  it('follow normal availability, are already seen, and email the customer but not the owner', async () => {
    const res = await manual({ source: 'phone', staff: 'lee', startAt: startIn(180) });
    expect(res.status).toBe(201);
    const body = manualBookingResponseSchema.parse(res.body);
    expect(body.booking).toMatchObject({ source: 'phone', isNew: false, staffRequested: true });
    expect(body.overrideUsed).toBe(false);
    const mail = (await emailOutboxRepo.listOutboxForBooking(body.booking.id)).map(
      (m) => m.template,
    );
    expect(mail).toEqual(['bookingConfirmed']);
    const audit = await db()
      .collection<{ actor: { type: string }; meta: Record<string, unknown> }>('auditLog')
      .findOne({ entityId: body.booking.id, action: 'booking.create' });
    expect(audit?.actor.type).toBe('owner');
    expect(audit?.meta.source).toBe('phone');
  });

  it('inside the lead time: refused without the override, allowed and audited with it', async () => {
    const soon = startIn(20);
    const refused = await manual({ source: 'phone', staff: 'nelly', startAt: soon });
    expect(refused.status).toBe(409);
    expect(apiErrorSchema.parse(refused.body).error.code).toBe('OUTSIDE_BOOKING_WINDOW');
    const allowed = await manual({
      source: 'phone',
      staff: 'nelly',
      startAt: soon,
      override: true,
    });
    expect(allowed.status).toBe(201);
    const body = manualBookingResponseSchema.parse(allowed.body);
    expect(body.overrideUsed).toBe(true);
    const audit = await db()
      .collection<{ meta: Record<string, unknown> }>('auditLog')
      .findOne({ entityId: body.booking.id, action: 'booking.create' });
    expect(audit?.meta).toMatchObject({ override: true, overrideUsed: true });
  });

  it('beyond the booking window: refused without the override, allowed with it', async () => {
    const far = shopDayStart(shopDateOf(new Date())).plus({ days: 45 }).toISODate() ?? '';
    const at = shopLocalToUtc(far, '10:00').toISOString();
    expect(
      apiErrorSchema.parse((await manual({ source: 'phone', staff: 'drew', startAt: at })).body)
        .error.code,
    ).toBe('OUTSIDE_BOOKING_WINDOW');
    const ok = await manual({ source: 'phone', staff: 'drew', startAt: at, override: true });
    expect(ok.status).toBe(201);
    expect(manualBookingResponseSchema.parse(ok.body).overrideUsed).toBe(true);
  });

  it('the override never takes a slot someone already holds', async () => {
    // A fixed open slot tomorrow: five hours from now can cross midnight late in the day.
    const at = slotAt(shopDateOf(new Date(Date.now() + 24 * 60 * 60_000)), '15:00');
    await bookPublic(server.baseUrl, { staff: 'lee', serviceIds: [cut], startAt: at });
    const res = await manual({ source: 'phone', staff: 'lee', startAt: at, override: true });
    expect(res.status).toBe(409);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('SLOT_TAKEN');
  });

  it('is idempotent and validates its input', async () => {
    const key = idemKey();
    // The same customer both times: a different body under the same key is a 422.
    // A fixed open slot tomorrow: seven hours from now can land after closing late in the day.
    const payload = {
      source: 'phone',
      staff: 'lee',
      startAt: slotAt(shopDateOf(new Date(Date.now() + 24 * 60 * 60_000)), '12:00'),
      customer: { name: 'Same Caller', phone: phone(), email: null },
    };
    const first = await manual(payload, key);
    const again = await manual(payload, key);
    expect(again.headers.get('idempotent-replayed')).toBe('true');
    expect(again.body).toEqual(first.body);
    expect((await asOwner('POST', '/api/admin/bookings', { source: 'phone' })).status).toBe(400);
    const noTime = await manual({ source: 'phone', staff: 'lee' });
    expect(apiErrorSchema.parse(noTime.body).error.details?.[0]?.path).toBe('startAt');
  });
});

describe('walk-ins', () => {
  it('start now, take slot locks, skip the email by default, and block online booking of that time', async () => {
    const res = await manual({
      source: 'walkIn',
      staff: 'drew',
      customer: { name: 'Walk In', phone: phone(), email: 'w@example.com' },
    });
    expect(res.status).toBe(201);
    const body = manualBookingResponseSchema.parse(res.body);
    expect(body.booking.source).toBe('walkIn');
    expect(body.outsideWorkingTime).toBe(false);
    expect(Math.abs(new Date(body.booking.startAt).getTime() - Date.now())).toBeLessThan(120_000);
    expect(
      (await slotLocksRepo.listSlotLocksForHolder(body.booking.id)).length,
    ).toBeGreaterThanOrEqual(3);
    expect(await emailOutboxRepo.listOutboxForBooking(body.booking.id)).toEqual([]);
    const overlap = await manual({ source: 'walkIn', staff: 'drew' });
    expect(overlap.status).toBe(409);
    expect(apiErrorSchema.parse(overlap.body).error.code).toBe('SLOT_TAKEN');
  });

  it('can email the customer when asked, and starts at a given time today', async () => {
    const later = startIn(240);
    if (shopDateOf(new Date(later)) !== shopDateOf(new Date())) return; // too close to midnight to test today
    const res = await manual({
      source: 'walkIn',
      staff: 'nelly',
      startAt: later,
      notifyCustomer: true,
    });
    expect(res.status).toBe(201);
    const id = manualBookingResponseSchema.parse(res.body).booking.id;
    expect((await emailOutboxRepo.listOutboxForBooking(id)).map((m) => m.template)).toEqual([
      'bookingConfirmed',
    ]);
  });

  it('flags a walk-in outside working time but still takes it; a time block lock still wins', async () => {
    const from = new Date();
    await db()
      .collection('timeBlocks')
      .insertOne({
        _id: '64a1f2c3d4e5f60718293abc',
        staffId: lee,
        kind: 'timeOff',
        startAt: addMinutes(from, -60),
        endAt: addMinutes(from, 120),
        reason: null,
        createdBy: { type: 'owner', userId: null, staffId: null },
        createdAt: from,
      } as never);
    const res = await manual({ source: 'walkIn', staff: 'lee' });
    expect(res.status).toBe(201);
    expect(manualBookingResponseSchema.parse(res.body).outsideWorkingTime).toBe(true);
    await db()
      .collection('timeBlocks')
      .deleteOne({ _id: '64a1f2c3d4e5f60718293abc' } as never);
  });

  it('needs a specific chair and a time today', async () => {
    expect((await manual({ source: 'walkIn', staff: 'any' })).status).toBe(400);
    const tomorrow = addMinutes(new Date(), 26 * 60).toISOString();
    expect((await manual({ source: 'walkIn', staff: 'nelly', startAt: tomorrow })).status).toBe(
      400,
    );
    expect((await manual({ source: 'walkIn', staff: 'nobody' })).status).toBe(409);
  });
});

describe('owner reschedule', () => {
  it('moves a booking, can override lead time, and notifies only when asked', async () => {
    // Dontrise has no walk-ins from the tests above, so the early slot is free. Tomorrow
    // at ten, rather than hours from now, so the booking never spills past midnight. The shop
    // is closed on Mondays, so a Monday tomorrow moves to Tuesday.
    let day = shopDayStart(shopDateOf(new Date())).plus({ days: 1 });
    if (day.weekday === 1) day = day.plus({ days: 1 });
    const tomorrow = day.toISODate() ?? '';
    const created = await bookPublic(server.baseUrl, {
      staff: 'dontrise',
      serviceIds: [cut],
      startAt: slotAt(tomorrow, '10:00'),
      email: 'move@example.com',
    });
    const quiet = await asOwner('POST', `/api/admin/bookings/${created.id}/reschedule`, {
      startAt: startIn(25),
      notify: false,
      override: true,
    });
    expect(quiet.status).toBe(200);
    const templates = (await emailOutboxRepo.listOutboxForBooking(created.id)).map(
      (m) => m.template,
    );
    expect(templates).not.toContain('bookingRescheduled');
    expect(templates).not.toContain('ownerBookingRescheduled');
    const loud = await asOwner('POST', `/api/admin/bookings/${created.id}/reschedule`, {
      startAt: slotAt(tomorrow, '11:00'),
      notify: true,
    });
    expect(loud.status).toBe(200);
    expect(
      (await emailOutboxRepo.listOutboxForBooking(created.id)).map((m) => m.template),
    ).toContain('bookingRescheduled');
    expect((await bookingsRepo.findBookingById(created.id))?.manageTokenVersion).toBe(3);
  });
});
