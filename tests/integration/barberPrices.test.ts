import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '../../shared/api/errors';
import {
  bookingDetailResponseSchema,
  bookingResponseSchema,
  staffListResponseSchema,
  staffMutationResponseSchema,
  staffResponseSchema,
} from '../../shared/api/admin';
import { availabilityResponseSchema } from '../../shared/api/availability';
import {
  createBookingResponseSchema,
  manageBookingResponseSchema,
  rescheduleBookingResponseSchema,
} from '../../shared/api/bookings';
import {
  publicStaffListResponseSchema,
  publicStaffResponseSchema,
  staffOpeningsResponseSchema,
} from '../../shared/api/public';
import { deliverOutboxIds } from '../../server/notifications/deliver';
import { LogEmailChannel } from '../../server/notifications/email/logChannel';
import { setChannel } from '../../server/notifications/registry';
import { bookingsRepo, emailOutboxRepo, slotLocksRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, servicesSeed, staffSeed, staffSeedId } from '../../seed/shop';
import { createLogin, sessionCookie, teamCookie } from '../helpers/auth';
import {
  call,
  idemKey,
  nextDate,
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
let trialId = '';

// A different weekday per group so the groups never share a chair or a time.
const TUE = nextDate(2, 3);
const WED = nextDate(3, 3);
const THU = nextDate(4, 3);
const FRI = nextDate(5, 3);
const SAT = nextDate(6, 3);
const SUN = nextDate(7, 3);

const haircut = serviceSeedId('haircut');
const lineup = serviceSeedId('lineup');
const kids = serviceSeedId('kids-cut');
const cutDesign = serviceSeedId('cut-design');
const shop = (key: string) => servicesSeed.find((s) => s.key === key)?.input;
const drew = staffSeedId('drew');
const dontrise = staffSeedId('dontrise');
const nelly = staffSeedId('nelly');
const lee = staffSeedId('lee');

function as(cookie: string) {
  return (method: string, path: string, body?: unknown) =>
    call(server.baseUrl, method, path, {
      headers: { cookie },
      ...(body === undefined ? {} : { body }),
    });
}
const owner = (method: string, path: string, body?: unknown) => as(ownerCookie)(method, path, body);
/** An owner phone booking or walk-in; these need an Idempotency-Key like the public ones. */
const ownerBook = (body: unknown) =>
  call(server.baseUrl, 'POST', '/api/admin/bookings', {
    headers: { cookie: ownerCookie, 'idempotency-key': idemKey() },
    body,
  });
const codeOf = (body: unknown) => apiErrorSchema.parse(body).error.code;

async function book(input: {
  staff: string;
  serviceIds: string[];
  startAt: string;
  email?: string | null;
}) {
  const res = await call(server.baseUrl, 'POST', '/api/bookings', {
    headers: { 'idempotency-key': idemKey() },
    body: {
      serviceIds: input.serviceIds,
      staff: input.staff,
      startAt: input.startAt,
      customer: { name: 'Sam Customer', phone: phone(), email: input.email ?? null },
    },
  });
  return res;
}

async function bookOk(input: Parameters<typeof book>[0]) {
  const res = await book(input);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return createBookingResponseSchema.parse(res.body);
}

function tokenOf(managePath: string): string {
  return new URL(managePath, 'http://x').searchParams.get('token') ?? '';
}

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  const login = await createLogin({ role: 'owner', staffId: dontrise });
  ownerCookie = await sessionCookie(login._id);
});
afterAll(async () => {
  await server.close();
  setChannel('email', null);
});

describe('the seed', () => {
  it('stores the overrides from the menus: Dontrise, Drew and Nelly differ, Lee uses the shop prices', () => {
    const byKey = new Map(staffSeed.map((s) => [s.key, s.input.servicePrices ?? []]));
    expect(byKey.get('lee')).toEqual([]);
    expect(byKey.get('iniya')).toEqual([]);
    expect(byKey.get('nelly')).toEqual([{ serviceId: haircut, priceCents: 4500 }]);
    expect(byKey.get('drew')).toEqual([{ serviceId: kids, priceCents: 2500 }]);
    expect(byKey.get('dontrise')).toEqual(
      expect.arrayContaining([
        { serviceId: haircut, priceCents: 5000, durationMinutes: 75 },
        { serviceId: cutDesign, priceCents: 7000 },
        { serviceId: kids, priceCents: 3000, durationMinutes: 45 },
        { serviceId: serviceSeedId('kids-design'), priceCents: 4000, durationMinutes: 90 },
        { serviceId: lineup, priceCents: 3000, durationMinutes: 40 },
        { serviceId: serviceSeedId('color-cut'), priceCents: 10000, durationMinutes: 180 },
      ]),
    );
    expect(byKey.get('dontrise')).toHaveLength(6);
  });

  it('every override is for a service the person offers, one per service', () => {
    for (const member of staffSeed) {
      const ids = (member.input.servicePrices ?? []).map((p) => p.serviceId);
      expect(new Set(ids).size, member.key).toBe(ids.length);
      for (const id of ids) expect(member.input.serviceIds, member.key).toContain(id);
    }
  });
});

describe('a booking with a chosen barber', () => {
  it("stores the barber's price and time: Dontrise takes 75 minutes and charges $50 for a haircut", async () => {
    const start = slotAt(WED, '10:00');
    const made = await bookOk({ staff: 'dontrise', serviceIds: [haircut], startAt: start });
    expect(made.booking.totalPriceCents).toBe(5000);
    expect(made.booking.durationMinutes).toBe(75);
    expect(made.booking.services[0]).toMatchObject({
      serviceId: haircut,
      name: 'Haircut',
      priceCents: 5000,
      durationMinutes: 75,
    });
    expect(new Date(made.booking.endAt).getTime() - new Date(start).getTime()).toBe(75 * 60_000);
    const stored = await bookingsRepo.findBookingById(made.booking.id);
    expect(stored?.totalPriceCents).toBe(5000);
    expect(stored?.durationMinutes).toBe(75);
    // 75 minutes plus the 10 minute cleanup gap: 10:00 to 11:25 locks six 15 minute blocks.
    expect(await slotLocksRepo.listSlotLocksForHolder(made.booking.id)).toHaveLength(6);
  });

  it('a barber with no entry for the service charges the shop price and takes the shop time', async () => {
    const made = await bookOk({
      staff: 'lee',
      serviceIds: [haircut],
      startAt: slotAt(WED, '10:00'),
    });
    expect(made.booking.totalPriceCents).toBe(shop('haircut')?.priceCents);
    expect(made.booking.durationMinutes).toBe(shop('haircut')?.durationMinutes);
  });

  it("Drew's kids price shows in the booking, the confirmation email, the owner alert and the admin views", async () => {
    const log = new LogEmailChannel();
    setChannel('email', log);
    const made = await bookOk({
      staff: 'drew',
      serviceIds: [kids, lineup],
      startAt: slotAt(WED, '12:00'),
      email: 'sam@example.com',
    });
    // Kids Cut $25 with Drew (the shop price is $20) plus the shop Lineup at $20.
    expect(made.booking.totalPriceCents).toBe(4500);
    expect(made.booking.services.map((s) => [s.name, s.priceCents])).toEqual([
      ['Kids Cut', 2500],
      ['Lineup', 2000],
    ]);

    const rows = await emailOutboxRepo.listOutboxForBooking(made.booking.id);
    await deliverOutboxIds(rows.map((r) => r._id));
    const customerMail = log.sent.find((m) => m.to === 'sam@example.com');
    const ownerMail = log.sent.find((m) => m.to !== 'sam@example.com');
    expect(customerMail?.text).toContain('Kids Cut: $25 (30 min)');
    expect(customerMail?.text).toContain('Total: $45');
    // A chosen barber's price is exact: no "from" anywhere in the email.
    expect(customerMail?.text).not.toMatch(/from \$|starting price/i);
    expect(customerMail?.html).toContain('$45');
    expect(ownerMail?.text).toContain('Total: $45');
    expect(ownerMail?.text).toContain('Kids Cut: $25 (30 min)');

    const detail = bookingDetailResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings/${made.booking.id}`)).body,
    );
    expect(detail.booking.totalPriceCents).toBe(4500);
    expect(detail.booking.services[0]?.priceCents).toBe(2500);
    const list = (await owner('GET', `/api/admin/bookings?from=${WED}&to=${WED}&staffId=${drew}`))
      .body as { bookings: { id: string; totalPriceCents: number }[] };
    expect(list.bookings.find((b) => b.id === made.booking.id)?.totalPriceCents).toBe(4500);

    const managed = manageBookingResponseSchema.parse(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/bookings/manage?token=${encodeURIComponent(tokenOf(made.managePath))}`,
        )
      ).body,
    );
    expect(managed.booking.totalPriceCents).toBe(4500);
  });

  it("an owner walk-in and a phone booking use the chair's price and time too", async () => {
    const walkIn = await ownerBook({
      source: 'walkIn',
      serviceIds: [lineup],
      staff: 'dontrise',
      customer: { name: 'Walk In', phone: phone(), email: null },
    });
    expect(walkIn.status, JSON.stringify(walkIn.body)).toBe(201);
    const walkInBooking = bookingResponseSchema.shape.booking.parse(
      (walkIn.body as { booking: unknown }).booking,
    );
    expect(walkInBooking.totalPriceCents).toBe(3000);
    expect(walkInBooking.durationMinutes).toBe(40);

    const phoneBooking = await ownerBook({
      source: 'phone',
      serviceIds: [cutDesign],
      staff: 'dontrise',
      startAt: slotAt(SAT, '16:00'),
      customer: { name: 'Phone Caller', phone: phone(), email: null },
      override: false,
      notifyCustomer: false,
    });
    expect(phoneBooking.status, JSON.stringify(phoneBooking.body)).toBe(201);
    const booking = bookingResponseSchema.shape.booking.parse(
      (phoneBooking.body as { booking: unknown }).booking,
    );
    expect(booking.totalPriceCents).toBe(7000);
    // Cut with Design has no time override for Dontrise, so the shop's 60 minutes stand.
    expect(booking.durationMinutes).toBe(60);
  });
});

describe('a booking with first available', () => {
  it('picks the barber and prices the booking for that barber, one after another', async () => {
    const start = slotAt(THU, '11:00');
    const seen: [string, number, number][] = [];
    for (let i = 0; i < 4; i += 1) {
      const made = await bookOk({ staff: 'any', serviceIds: [kids], startAt: start });
      expect(made.booking.staffRequested).toBe(false);
      seen.push([
        made.booking.staff.slug,
        made.booking.totalPriceCents,
        made.booking.durationMinutes,
      ]);
    }
    // Nobody is booked yet, so display order decides; each next booking skips the busy chair.
    expect(seen).toEqual([
      ['dontrise', 3000, 45],
      ['lee', 2000, 30],
      ['drew', 2500, 30],
      ['nelly', 2000, 30],
    ]);
    // Nobody left for that start: the fifth is refused instead of landing on someone unqualified.
    const none = await book({ staff: 'any', serviceIds: [kids], startAt: start });
    expect(none.status).toBe(409);
  });

  it("only offers a start a barber can finish with that barber's own time", async () => {
    const day = async (staff: string) =>
      availabilityResponseSchema.parse(
        (
          await call(
            server.baseUrl,
            'GET',
            `/api/availability?date=${FRI}&serviceIds=${haircut}&staff=${staff}`,
          )
        ).body,
      );
    const last = (slots: { startAt: string }[]) => slots[slots.length - 1]?.startAt;
    // The shop closes at 19:00. A 45 minute haircut can start at 18:15, Dontrise's 75 minutes at 17:45.
    expect(last((await day('lee')).slots)).toBe(slotAt(FRI, '18:15'));
    expect(last((await day('dontrise')).slots)).toBe(slotAt(FRI, '17:45'));
    // First available at 18:00: Dontrise cannot finish, so the slot goes to someone who can.
    const any = await day('any');
    const at18 = any.slots.find((s) => s.startAt === slotAt(FRI, '18:00'));
    expect(at18).toBeDefined();
    expect(at18?.staffId).not.toBe(dontrise);
    const made = await bookOk({
      staff: 'any',
      serviceIds: [haircut],
      startAt: slotAt(FRI, '18:00'),
    });
    expect(made.booking.staff.slug).not.toBe('dontrise');
    expect(made.booking.durationMinutes).toBe(45);
  });

  it("reports the shortest time on the availability response and the chair's own time on its openings", async () => {
    const a = availabilityResponseSchema.parse(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/availability?date=${SUN}&serviceIds=${haircut}&staff=dontrise`,
        )
      ).body,
    );
    // Dontrise's haircut is 75 minutes plus the 10 minute cleanup gap.
    expect(a.durationMinutes).toBe(85);
    const leeDay = availabilityResponseSchema.parse(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/availability?date=${SUN}&serviceIds=${haircut}&staff=lee`,
        )
      ).body,
    );
    expect(leeDay.durationMinutes).toBe(55);

    const openings = async (slug: string) =>
      staffOpeningsResponseSchema.parse(
        (await call(server.baseUrl, 'GET', `/api/staff/${slug}/openings?count=1`)).body,
      );
    expect((await openings('dontrise')).service).toMatchObject({
      name: 'Lineup',
      durationMinutes: 40,
    });
    expect((await openings('lee')).service).toMatchObject({ name: 'Lineup', durationMinutes: 20 });
  });
});

describe('rescheduling', () => {
  it('on the same chair keeps the price and the length the booking was made with', async () => {
    const made = await bookOk({
      staff: 'dontrise',
      serviceIds: [haircut],
      startAt: slotAt(TUE, '10:00'),
    });
    expect(made.booking.totalPriceCents).toBe(5000);
    // The owner changes Dontrise's haircut afterwards.
    const edit = await owner('PATCH', `/api/admin/staff/${dontrise}`, {
      servicePrices: [
        { serviceId: haircut, priceCents: 6500, durationMinutes: 60 },
        ...(staffSeed
          .find((s) => s.key === 'dontrise')
          ?.input.servicePrices?.filter((p) => p.serviceId !== haircut) ?? []),
      ],
    });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);

    const moved = rescheduleBookingResponseSchema.parse(
      (
        await call(server.baseUrl, 'POST', '/api/bookings/manage/reschedule', {
          body: { token: tokenOf(made.managePath), startAt: slotAt(TUE, '14:00') },
        })
      ).body,
    );
    expect(moved.booking.totalPriceCents).toBe(5000);
    expect(moved.booking.durationMinutes).toBe(75);
    expect(
      new Date(moved.booking.endAt).getTime() - new Date(moved.booking.startAt).getTime(),
    ).toBe(75 * 60_000);
    const stored = await bookingsRepo.findBookingById(made.booking.id);
    expect(stored?.services[0]?.priceCents).toBe(5000);

    // A new booking after the edit does use the new price and time.
    const fresh = await bookOk({
      staff: 'dontrise',
      serviceIds: [haircut],
      startAt: slotAt(TUE, '16:00'),
    });
    expect(fresh.booking.totalPriceCents).toBe(6500);
    expect(fresh.booking.durationMinutes).toBe(60);
  });

  it('a booking made at an older price keeps its stored cents, also after a move', async () => {
    const made = await bookOk({
      staff: 'drew',
      serviceIds: [haircut],
      startAt: slotAt(SAT, '10:00'),
    });
    expect(made.booking.totalPriceCents).toBe(4000);
    // As if it had been made when the price was lower.
    await db()
      .collection('bookings')
      .updateOne({ _id: made.booking.id } as never, {
        $set: { totalPriceCents: 3500, 'services.0.priceCents': 3500 },
      });
    await owner('PATCH', `/api/admin/staff/${drew}`, {
      servicePrices: [
        { serviceId: kids, priceCents: 2500 },
        { serviceId: haircut, priceCents: 6000 },
      ],
    });
    const detail = async () =>
      bookingDetailResponseSchema.parse(
        (await owner('GET', `/api/admin/bookings/${made.booking.id}`)).body,
      ).booking;
    expect((await detail()).totalPriceCents).toBe(3500);
    const moved = await owner('POST', `/api/admin/bookings/${made.booking.id}/reschedule`, {
      startAt: slotAt(SAT, '12:00'),
      notify: false,
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const after = await detail();
    expect(after.totalPriceCents).toBe(3500);
    expect(after.services[0]?.priceCents).toBe(3500);
    expect(after.startAt).toBe(slotAt(SAT, '12:00'));
  });

  it("moved by the owner to another barber, the booking takes that barber's price and time", async () => {
    const made = await bookOk({
      staff: 'lee',
      serviceIds: [haircut],
      startAt: slotAt(SUN, '13:00'),
    });
    expect(made.booking.totalPriceCents).toBe(4000);
    expect(made.booking.durationMinutes).toBe(45);
    const toNelly = await owner('POST', `/api/admin/bookings/${made.booking.id}/reschedule`, {
      startAt: slotAt(SUN, '13:00'),
      staff: 'nelly',
      notify: false,
    });
    expect(toNelly.status, JSON.stringify(toNelly.body)).toBe(200);
    const nellyView = bookingResponseSchema.parse(toNelly.body).booking;
    expect(nellyView.staff.slug).toBe('nelly');
    expect(nellyView.totalPriceCents).toBe(4500);
    expect(nellyView.durationMinutes).toBe(45);
    expect(nellyView.services[0]?.priceCents).toBe(4500);

    const toDontrise = await owner('POST', `/api/admin/bookings/${made.booking.id}/reschedule`, {
      startAt: slotAt(SUN, '15:00'),
      staff: 'dontrise',
      notify: false,
    });
    expect(toDontrise.status, JSON.stringify(toDontrise.body)).toBe(200);
    const dView = bookingResponseSchema.parse(toDontrise.body).booking;
    expect(dView.totalPriceCents).toBe(6500);
    expect(dView.durationMinutes).toBe(60);
    expect(new Date(dView.endAt).getTime() - new Date(dView.startAt).getTime()).toBe(60 * 60_000);
    const stored = await bookingsRepo.findBookingById(made.booking.id);
    // 60 minutes plus the cleanup gap are locked on the new chair, none on the old ones.
    expect(await slotLocksRepo.listSlotLocksForHolder(made.booking.id)).toHaveLength(5);
    expect(stored?.staffId).toBe(dontrise);
  });
});

describe('the public price payloads', () => {
  it("/api/staff and /api/staff/:slug carry the barber's prices and nothing private", async () => {
    const list = publicStaffListResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/staff')).body,
    );
    const nellyRow = list.staff.find((s) => s.slug === 'nelly');
    expect(nellyRow?.servicePrices).toEqual([{ serviceId: haircut, priceCents: 4500 }]);
    expect(list.staff.find((s) => s.slug === 'lee')?.servicePrices).toEqual([]);
    const one = publicStaffResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/staff/nelly')).body,
    );
    expect(one.staff.servicePrices).toEqual([{ serviceId: haircut, priceCents: 4500 }]);
    const raw = JSON.stringify((await call(server.baseUrl, 'GET', '/api/staff')).body);
    expect(raw).not.toContain('slugKeys');
    expect(raw).not.toContain('createdAt');
  });

  it('a staff record from before the field reads as no overrides and still books at the shop price', async () => {
    await db()
      .collection('staff')
      .updateOne({ _id: lee } as never, { $unset: { servicePrices: '' } });
    const list = publicStaffListResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/staff')).body,
    );
    expect(list.staff.find((s) => s.slug === 'lee')?.servicePrices).toEqual([]);
    const admin = staffListResponseSchema.parse((await owner('GET', '/api/admin/staff')).body);
    expect(admin.staff.find((s) => s.id === lee)?.servicePrices).toEqual([]);
    const made = await bookOk({
      staff: 'lee',
      serviceIds: [lineup],
      startAt: slotAt(FRI, '11:00'),
    });
    expect(made.booking.totalPriceCents).toBe(2000);
  });
});

describe('PATCH /api/admin/staff/:id with servicePrices', () => {
  const patch = (id: string, servicePrices: unknown, extra: Record<string, unknown> = {}) =>
    owner('PATCH', `/api/admin/staff/${id}`, { servicePrices, ...extra });

  it('saves the list, shows it in the admin and public views, and writes an audit entry with both sides', async () => {
    const res = await patch(nelly, [
      { serviceId: haircut, priceCents: 4700 },
      { serviceId: kids, priceCents: 2200, durationMinutes: 35 },
    ]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(staffMutationResponseSchema.parse(res.body).staff.servicePrices).toEqual([
      { serviceId: haircut, priceCents: 4700 },
      { serviceId: kids, priceCents: 2200, durationMinutes: 35 },
    ]);
    const pub = publicStaffResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/staff/nelly')).body,
    );
    expect(pub.staff.servicePrices).toHaveLength(2);
    const audit = await db()
      .collection<{ action: string; before: unknown; after: unknown; actor: { type: string } }>(
        'auditLog',
      )
      .find({ entityId: nelly, action: 'staff.prices.update' })
      .toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actor.type).toBe('owner');
    expect(audit[0]?.before).toEqual({
      servicePrices: [{ serviceId: haircut, priceCents: 4500 }],
    });
    expect(audit[0]?.after).toEqual({
      servicePrices: [
        { serviceId: haircut, priceCents: 4700 },
        { serviceId: kids, priceCents: 2200, durationMinutes: 35 },
      ],
    });
    // Saving the same list again is not a change, so it is not logged again.
    await patch(nelly, [
      { serviceId: haircut, priceCents: 4700 },
      { serviceId: kids, priceCents: 2200, durationMinutes: 35 },
    ]);
    expect(
      await db()
        .collection('auditLog')
        .countDocuments({ entityId: nelly, action: 'staff.prices.update' }),
    ).toBe(1);
  });

  it('refuses two entries for one service', async () => {
    const res = await patch(nelly, [
      { serviceId: haircut, priceCents: 4700 },
      { serviceId: haircut, priceCents: 4800 },
    ]);
    expect(res.status).toBe(400);
    expect(codeOf(res.body)).toBe('VALIDATION_ERROR');
    expect(apiErrorSchema.parse(res.body).error.details?.[0]).toMatchObject({
      path: 'servicePrices.1.serviceId',
      message: 'Only one price per service',
    });
  });

  it('refuses a negative price, a price with a fraction of a cent and a time that is not in steps of five', async () => {
    for (const bad of [
      [{ serviceId: haircut, priceCents: -1 }],
      [{ serviceId: haircut, priceCents: 4500.5 }],
      [{ serviceId: haircut, priceCents: '4500' }],
      [{ serviceId: haircut, priceCents: 4500, durationMinutes: 47 }],
      [{ serviceId: haircut, priceCents: 4500, durationMinutes: 0 }],
      [{ serviceId: 'not-an-id', priceCents: 4500 }],
    ]) {
      const res = await patch(nelly, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(codeOf(res.body)).toBe('VALIDATION_ERROR');
    }
  });

  it('refuses a price for a service the barber does not offer, alone or with the menu in the same request', async () => {
    // Nelly does not do the lineup.
    const alone = await patch(nelly, [{ serviceId: lineup, priceCents: 2500 }]);
    expect(alone.status).toBe(400);
    expect(codeOf(alone.body)).toBe('VALIDATION_ERROR');
    expect(apiErrorSchema.parse(alone.body).error.details?.[0]).toMatchObject({
      path: 'servicePrices.0.serviceId',
      message: 'This person does not offer that service',
    });
    const together = await patch(nelly, [{ serviceId: kids, priceCents: 2200 }], {
      serviceIds: [haircut],
    });
    expect(together.status).toBe(400);
    expect(codeOf(together.body)).toBe('VALIDATION_ERROR');
    // The refused requests changed nothing.
    const after = staffListResponseSchema.parse((await owner('GET', '/api/admin/staff')).body);
    expect(after.staff.find((s) => s.id === nelly)?.servicePrices).toHaveLength(2);
  });

  it('create validates the same way and stores the list', async () => {
    const body = (servicePrices: unknown) => ({
      slug: 'trial-chair',
      name: 'Trial Chair',
      role: 'barber',
      title: 'Barber',
      specialty: '',
      bio: '',
      chairNumber: 9,
      serviceIds: [haircut, kids],
      photoUrl: null,
      instagramHandle: null,
      sortOrder: 90,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
      servicePrices,
    });
    const bad = await owner(
      'POST',
      '/api/admin/staff',
      body([{ serviceId: lineup, priceCents: 1 }]),
    );
    expect(bad.status).toBe(400);
    const dup = await owner(
      'POST',
      '/api/admin/staff',
      body([
        { serviceId: haircut, priceCents: 1 },
        { serviceId: haircut, priceCents: 2 },
      ]),
    );
    expect(dup.status).toBe(400);
    const ok = await owner(
      'POST',
      '/api/admin/staff',
      body([
        { serviceId: haircut, priceCents: 3900, durationMinutes: 40 },
        { serviceId: kids, priceCents: 1800 },
      ]),
    );
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const created = staffResponseSchema.parse(ok.body).staff;
    expect(created.servicePrices).toEqual([
      { serviceId: haircut, priceCents: 3900, durationMinutes: 40 },
      { serviceId: kids, priceCents: 1800 },
    ]);
    trialId = created.id;
  });

  it('taking a service off the menu takes its price with it; an empty list clears them all', async () => {
    const removed = await owner('PATCH', `/api/admin/staff/${trialId}`, { serviceIds: [haircut] });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(staffMutationResponseSchema.parse(removed.body).staff.servicePrices).toEqual([
      { serviceId: haircut, priceCents: 3900, durationMinutes: 40 },
    ]);
    const cleared = await patch(trialId, []);
    expect(cleared.status).toBe(200);
    expect(staffMutationResponseSchema.parse(cleared.body).staff.servicePrices).toEqual([]);
  });

  it("clearing a barber's prices puts the shop price back on new bookings", async () => {
    expect((await patch(nelly, [])).status).toBe(200);
    const made = await bookOk({
      staff: 'nelly',
      serviceIds: [haircut],
      startAt: slotAt(FRI, '14:00'),
    });
    expect(made.booking.totalPriceCents).toBe(shop('haircut')?.priceCents);
    expect(made.booking.durationMinutes).toBe(shop('haircut')?.durationMinutes);
  });
});

describe('who may change prices', () => {
  it('only the owner: an anonymous caller, a barber and an owner on a temporary password are refused', async () => {
    const body = { servicePrices: [{ serviceId: haircut, priceCents: 1 }] };
    const anonymous = await call(server.baseUrl, 'PATCH', `/api/admin/staff/${drew}`, { body });
    expect(anonymous.status).toBe(401);
    expect(codeOf(anonymous.body)).toBe('AUTH_REQUIRED');
    const barber = await call(server.baseUrl, 'PATCH', `/api/admin/staff/${drew}`, {
      body,
      headers: { cookie: await teamCookie(drew) },
    });
    expect(barber.status).toBe(401);
    const temp = await createLogin({ role: 'owner', staffId: lee, mustChangePassword: true });
    const tempRes = await call(server.baseUrl, 'PATCH', `/api/admin/staff/${drew}`, {
      body,
      headers: { cookie: await sessionCookie(temp._id) },
    });
    expect(tempRes.status).toBe(403);
    expect(codeOf(tempRes.body)).toBe('PASSWORD_CHANGE_REQUIRED');
    // Nothing changed.
    const list = staffListResponseSchema.parse((await owner('GET', '/api/admin/staff')).body);
    expect(
      list.staff.find((s) => s.id === drew)?.servicePrices.some((p) => p.priceCents === 1),
    ).toBe(false);
  });
});
