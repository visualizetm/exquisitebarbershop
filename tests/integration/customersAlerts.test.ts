import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../../server/db/transaction';
import {
  alertsRepo,
  bookingsRepo,
  servicesRepo,
  slotLocksRepo,
  timeBlocksRepo,
  weeklyHoursRepo,
} from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, shopHoursSeed, staffSeed, staffSeedId } from '../../seed/shop';
import {
  conflictOnlyResponseSchema,
  customerListResponseSchema,
  customerResponseSchema,
  overviewResponseSchema,
  scheduleWeekResponseSchema,
} from '../../shared/api/admin';
import { apiErrorSchema } from '../../shared/api/errors';
import { generateReferenceCode } from '../../shared/lib/referenceCode';
import { addMinutes } from '../../shared/lib/time';
import { createLogin, sessionCookie, teamCookie } from '../helpers/auth';
import { call, nextDate, slotAt, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
let barberCookie: string;
const THU = nextDate(4, 3);
const lee = staffSeedId('lee');
const nelly = staffSeedId('nelly');
const drew = staffSeedId('drew');
const cut = serviceSeedId('haircut');

const asOwner = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie: ownerCookie },
    ...(body === undefined ? {} : { body }),
  });

async function seedBooking(
  staffId: string,
  hhmm: string,
  who: { name?: string; phone?: string; status?: 'confirmed' | 'completed' | 'noShow' } = {},
) {
  const startAt = new Date(slotAt(THU, hhmm));
  const service = await servicesRepo.findServiceById(cut);
  if (!service) throw new Error('missing service');
  const endAt = addMinutes(startAt, service.durationMinutes);
  return withTransaction(async (session) => {
    const booking = await bookingsRepo.insertBooking(
      {
        referenceCode: generateReferenceCode(),
        staffId,
        staffRequested: true,
        services: [
          {
            serviceId: service._id,
            name: service.name,
            group: service.group,
            priceCents: service.priceCents,
            priceFrom: service.priceFrom,
            durationMinutes: service.durationMinutes,
          },
        ],
        startAt,
        endAt,
        durationMinutes: service.durationMinutes,
        bufferMinutes: 10,
        totalPriceCents: service.priceCents,
        customer: {
          name: who.name ?? `Customer ${hhmm}`,
          phone: who.phone ?? '+12155550101',
          email: null,
        },
        status: who.status ?? 'confirmed',
        source: 'online',
        notes: null,
        cancellation: null,
        rescheduledFromId: null,
        manageTokenVersion: 1,
      },
      new Date(),
      { session },
    );
    if (booking.status === 'confirmed') {
      await slotLocksRepo.acquireSlotLocks(
        staffId,
        { start: startAt, end: addMinutes(endAt, 10) },
        { holderType: 'booking', holderId: booking._id },
        new Date(),
        { session },
      );
    }
    return booking;
  });
}

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  ownerCookie = await sessionCookie(
    (await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') }))._id,
  );
  barberCookie = await teamCookie(lee);
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  for (const name of [
    'bookings',
    'slotLocks',
    'timeBlocks',
    'auditLog',
    'alerts',
    'customerNotes',
  ]) {
    await db().collection(name).deleteMany({});
  }
  await weeklyHoursRepo.setShopHours(shopHoursSeed, new Date());
  for (const member of staffSeed)
    await weeklyHoursRepo.setStaffHours(staffSeedId(member.key), member.hours, new Date());
});

describe('the customer list', () => {
  it('groups bookings by phone with visits, no shows, last visit and the usual barber', async () => {
    await seedBooking(lee, '10:00', {
      name: 'Sam Rivera',
      phone: '+12155550111',
      status: 'completed',
    });
    await seedBooking(lee, '11:00', {
      name: 'Sam Rivera',
      phone: '+12155550111',
      status: 'completed',
    });
    await seedBooking(nelly, '12:00', {
      name: 'Sam Rivera',
      phone: '+12155550111',
      status: 'noShow',
    });
    await seedBooking(drew, '10:00', { name: 'Pat Parker', phone: '+12155550122' });

    const list = customerListResponseSchema.parse(
      (await asOwner('GET', '/api/admin/customer-list')).body,
    );
    expect(list.total).toBe(2);
    const sam = list.rows.find((r) => r.name === 'Sam Rivera');
    expect(sam).toMatchObject({
      phone: '(215) 555-0111',
      phoneE164: '+12155550111',
      bookings: 3,
      visits: 2,
      noShows: 1,
      usualBarber: 'Lee',
      hasNotes: false,
    });
    expect(sam?.lastVisitAt).not.toBeNull();
    const pat = list.rows.find((r) => r.name === 'Pat Parker');
    expect(pat?.visits).toBe(0);
    expect(pat?.lastVisitAt).toBeNull();
  });

  it('searches by name prefix, phone and last four digits, and sorts', async () => {
    await seedBooking(lee, '10:00', {
      name: 'Zoë Adams',
      phone: '+12155550133',
      status: 'completed',
    });
    await seedBooking(drew, '10:00', { name: 'Bo Brown', phone: '+12155550144' });
    const find = async (q: string) =>
      customerListResponseSchema
        .parse((await asOwner('GET', `/api/admin/customer-list?q=${encodeURIComponent(q)}`)).body)
        .rows.map((r) => r.name);
    expect(await find('zoe')).toEqual(['Zoë Adams']);
    expect(await find('0144')).toEqual(['Bo Brown']);
    expect(await find('(215) 555-0133')).toEqual(['Zoë Adams']);
    expect(await find('nobody')).toEqual([]);
    const byName = customerListResponseSchema.parse(
      (await asOwner('GET', '/api/admin/customer-list?sort=name&dir=asc')).body,
    );
    expect(byName.rows.map((r) => r.name)).toEqual(['Bo Brown', 'Zoë Adams']);
  });

  it('keeps a private note per customer: saved, shown on the detail, removed when emptied', async () => {
    await seedBooking(lee, '10:00', { name: 'Noted Customer', phone: '+12155550155' });
    const saved = await asOwner('PUT', '/api/admin/customers/notes', {
      phone: '(215) 555-0155',
      notes: 'Prefers the quiet chair.',
    });
    expect(saved.status).toBe(200);
    const detail = customerResponseSchema.parse(
      (await asOwner('GET', '/api/admin/customers?phone=2155550155')).body,
    );
    expect(detail.notes).toBe('Prefers the quiet chair.');
    expect(detail.usualBarber?.name).toBe('Lee');
    const list = customerListResponseSchema.parse(
      (await asOwner('GET', '/api/admin/customer-list')).body,
    );
    expect(list.rows[0]?.hasNotes).toBe(true);
    // A barber's PIN session can neither read nor write it.
    for (const [method, path] of [
      ['GET', '/api/admin/customers?phone=2155550155'],
      ['GET', '/api/admin/customer-list'],
      ['PUT', '/api/admin/customers/notes'],
    ] as const) {
      const res = await call(server.baseUrl, method, path, {
        headers: { cookie: barberCookie },
        ...(method === 'PUT' ? { body: { phone: '2155550155', notes: 'x' } } : {}),
      });
      expect(res.status, path).toBe(401);
    }
    await asOwner('PUT', '/api/admin/customers/notes', { phone: '2155550155', notes: '   ' });
    expect(await db().collection('customerNotes').countDocuments({})).toBe(0);
  });
});

describe('the week schedule', () => {
  it('counts bookings per chair and day, leaving out cancelled ones', async () => {
    await seedBooking(lee, '10:00');
    await seedBooking(lee, '11:00');
    const gone = await seedBooking(lee, '12:00');
    await asOwner('POST', `/api/admin/bookings/${gone._id}/cancel`, { notify: false });
    const week = scheduleWeekResponseSchema.parse(
      (await asOwner('GET', `/api/admin/schedule/week?date=${THU}`)).body,
    );
    expect(week.days).toHaveLength(7);
    expect(week.days[0]?.label).toBe('Mon');
    const row = week.rows.find((r) => r.staff.slug === 'lee');
    expect(row?.cells.find((c) => c.date === THU)).toMatchObject({ count: 2, status: 'working' });
    expect(row?.cells.filter((c) => c.date !== THU).every((c) => c.count === 0)).toBe(true);
  });
});

describe('alerts and the owner decision', () => {
  async function raiseBarberOut(booking: { _id: string }) {
    // The barber's time off exists, with the booking left in place.
    await timeBlocksRepo.insertTimeBlock(
      {
        staffId: lee,
        kind: 'timeOff',
        startAt: new Date(slotAt(THU, '08:00')),
        endAt: new Date(slotAt(THU, '21:00')),
        reason: null,
        createdBy: { type: 'barber', userId: null, staffId: lee },
      },
      new Date(),
    );
    expect(booking._id).toBeTruthy();
    return alertsRepo.insertAlert(
      {
        kind: 'barberOut',
        staffId: lee,
        fromDate: THU,
        toDate: THU,
        startAt: new Date(slotAt(THU, '08:00')),
        endAt: new Date(slotAt(THU, '21:00')),
        reason: null,
      },
      new Date(),
    );
  }

  it('shows an open alert on the overview with how many bookings still need a decision', async () => {
    const a = await seedBooking(lee, '10:00');
    await seedBooking(lee, '11:00');
    await raiseBarberOut(a);
    const o = overviewResponseSchema.parse((await asOwner('GET', '/api/admin/overview')).body);
    expect(o.alerts).toHaveLength(1);
    expect(o.alerts[0]).toMatchObject({ kind: 'barberOut', staffName: 'Lee', affectedCount: 2 });
  });

  it('asks for a choice per booking, applies Move, Keep and Cancel together, and closes the alert', async () => {
    const a = await seedBooking(lee, '10:00');
    const b = await seedBooking(lee, '11:00');
    const c = await seedBooking(lee, '12:00');
    const alert = await raiseBarberOut(a);
    // No choices: the list comes back with the chairs each booking can move to.
    const ask = await asOwner('POST', `/api/admin/alerts/${alert._id}/resolve`, {});
    expect(ask.status).toBe(409);
    const affected = apiErrorSchema.parse(ask.body).error.affected ?? [];
    expect(affected.map((x) => x.bookingId).sort()).toEqual([a._id, b._id, c._id].sort());
    expect(affected.every((x) => (x.moveOptions ?? []).length > 0)).toBe(true);
    // Only two of three decided: refused, nothing changed.
    const partial = await asOwner('POST', `/api/admin/alerts/${alert._id}/resolve`, {
      resolutions: [{ bookingId: a._id, action: 'move', toStaffId: nelly }],
    });
    expect(partial.status).toBe(409);
    expect((await bookingsRepo.findBookingById(a._id))?.staffId).toBe(lee);

    const done = await asOwner('POST', `/api/admin/alerts/${alert._id}/resolve`, {
      resolutions: [
        { bookingId: a._id, action: 'move', toStaffId: nelly },
        { bookingId: b._id, action: 'keep' },
        { bookingId: c._id, action: 'cancel' },
      ],
    });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(conflictOnlyResponseSchema.parse(done.body)).toMatchObject({
      moved: [a._id],
      kept: [b._id],
      cancelled: [c._id],
    });
    expect((await bookingsRepo.findBookingById(a._id))?.staffId).toBe(nelly);
    expect((await bookingsRepo.findBookingById(b._id))?.status).toBe('confirmed');
    expect((await bookingsRepo.findBookingById(c._id))?.status).toBe('cancelled');
    expect((await alertsRepo.findAlertById(alert._id))?.status).toBe('resolved');
    // A second tap is refused, not applied twice.
    const again = await asOwner('POST', `/api/admin/alerts/${alert._id}/resolve`, {
      resolutions: [],
    });
    expect(again.status).toBe(409);
  });

  it('approves a time off request by creating the time off with the owner choices, or declines it', async () => {
    const a = await seedBooking(lee, '10:00');
    const request = await alertsRepo.insertAlert(
      {
        kind: 'timeOffRequest',
        staffId: lee,
        fromDate: THU,
        toDate: THU,
        startAt: new Date(slotAt(THU, '08:00')),
        endAt: new Date(slotAt(THU, '21:00')),
        reason: 'Family',
      },
      new Date(),
    );
    expect(await db().collection('timeBlocks').countDocuments({})).toBe(0);
    const ask = await asOwner('POST', `/api/admin/alerts/${request._id}/resolve`, {});
    expect(ask.status).toBe(409);
    const ok = await asOwner('POST', `/api/admin/alerts/${request._id}/resolve`, {
      resolutions: [{ bookingId: a._id, action: 'move', toStaffId: nelly }],
    });
    expect(ok.status).toBe(200);
    expect(await db().collection('timeBlocks').countDocuments({ staffId: lee })).toBe(1);
    expect((await alertsRepo.findAlertById(request._id))?.status).toBe('resolved');

    const other = await alertsRepo.insertAlert(
      {
        kind: 'timeOffRequest',
        staffId: drew,
        fromDate: THU,
        toDate: THU,
        startAt: new Date(slotAt(THU, '08:00')),
        endAt: new Date(slotAt(THU, '21:00')),
        reason: null,
      },
      new Date(),
    );
    const declined = await asOwner('POST', `/api/admin/alerts/${other._id}/dismiss`, {});
    expect(declined.status).toBe(200);
    expect((await alertsRepo.findAlertById(other._id))?.status).toBe('dismissed');
    expect(await db().collection('timeBlocks').countDocuments({ staffId: drew })).toBe(0);
  });
});
