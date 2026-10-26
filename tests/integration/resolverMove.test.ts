import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../../server/db/transaction';
import {
  bookingsRepo,
  servicesRepo,
  slotLocksRepo,
  staffRepo,
  weeklyHoursRepo,
} from '../../server/repos';
import { newId } from '../../server/lib/ids';
import { renderTemplate } from '../../server/notifications/templates';
import { createTimeBlock } from '../../server/services/adminSchedule';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, shopHoursSeed, staffSeed, staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import { generateReferenceCode } from '../../shared/lib/referenceCode';
import { addMinutes } from '../../shared/lib/time';
import { createLogin, sessionCookie } from '../helpers/auth';
import {
  call,
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
const THU = nextDate(4, 3);
const lee = staffSeedId('lee');
const drew = staffSeedId('drew');
const nelly = staffSeedId('nelly');
const dontrise = staffSeedId('dontrise');
const cut = serviceSeedId('haircut');

const asOwner = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie: ownerCookie },
    ...(body === undefined ? {} : { body }),
  });

/**
 * A confirmed booking with its locks. `own` is the chair's own price and minutes, as a booking on a
 * chair with an override stores them; without it the shop's.
 */
async function seedBooking(
  staffId: string,
  hhmm: string,
  serviceId = cut,
  own?: { priceCents: number; durationMinutes: number },
) {
  const startAt = new Date(slotAt(THU, hhmm));
  const found = await servicesRepo.findServiceById(serviceId);
  if (!found) throw new Error('missing service');
  const service = own ? { ...found, ...own } : found;
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
        customer: { name: `Customer ${hhmm}`, phone: phone(), email: 'c@example.com' },
        status: 'confirmed',
        source: 'online',
        notes: null,
        cancellation: null,
        rescheduledFromId: null,
        manageTokenVersion: 1,
      },
      new Date(),
      { session },
    );
    await slotLocksRepo.acquireSlotLocks(
      staffId,
      { start: startAt, end: addMinutes(endAt, 10) },
      { holderType: 'booking', holderId: booking._id },
      new Date(),
      { session },
    );
    return booking;
  });
}

/** Time off for one chair covering a whole Thursday. */
const timeOff = (staffId: string, resolutions?: unknown) =>
  asOwner('POST', '/api/admin/time-blocks', {
    staffId,
    kind: 'timeOff',
    startAt: slotAt(THU, '08:00'),
    endAt: slotAt(THU, '21:00'),
    ...(resolutions ? { resolutions } : {}),
  });

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  ownerCookie = await sessionCookie(
    (await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') }))._id,
  );
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  for (const name of ['bookings', 'slotLocks', 'timeBlocks', 'auditLog', 'emailOutbox']) {
    await db().collection(name).deleteMany({});
  }
  await weeklyHoursRepo.setShopHours(shopHoursSeed, new Date());
  for (const member of staffSeed)
    await weeklyHoursRepo.setStaffHours(staffSeedId(member.key), member.hours, new Date());
});

describe('the resolver: Move', () => {
  it('lists only chairs that do the service and are free the whole time', async () => {
    const booking = await seedBooking(lee, '12:00');
    // Drew is busy at the same time, so she is not offered.
    await seedBooking(drew, '12:00');
    const conflict = await timeOff(lee);
    expect(conflict.status).toBe(409);
    const [affected] = apiErrorSchema.parse(conflict.body).error.affected ?? [];
    expect(affected?.bookingId).toBe(booking._id);
    const ids = (affected?.moveOptions ?? []).map((o) => o.staffId);
    expect(ids).not.toContain(drew);
    expect(ids).not.toContain(lee);
    expect(ids).toContain(nelly);
    // Every chair offered does the service.
    for (const id of ids) {
      expect((await staffRepo.findStaffById(id))?.serviceIds).toContain(cut);
    }
  });

  it('moves the booking, its locks and its audit trail in one change', async () => {
    const booking = await seedBooking(lee, '12:00');
    const done = await timeOff(lee, [{ bookingId: booking._id, action: 'move', toStaffId: nelly }]);
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    expect((done.body as { moved: string[] }).moved).toEqual([booking._id]);
    const after = await bookingsRepo.findBookingById(booking._id);
    expect(after?.staffId).toBe(nelly);
    expect(after?.status).toBe('confirmed');
    // The customer is emailed the move, so the link version moves up like a reschedule.
    expect(after?.manageTokenVersion).toBe(2);
    // Nelly's own haircut price, $45 instead of the $40 Lee charges.
    expect(after?.totalPriceCents).toBe(4500);
    const locks = await slotLocksRepo.listSlotLocksForHolder(booking._id);
    expect(locks.length).toBeGreaterThan(0);
    expect(new Set(locks.map((l) => l.staffId))).toEqual(new Set([nelly]));
    expect(
      await db()
        .collection('auditLog')
        .countDocuments({ action: 'booking.move', entityId: booking._id }),
    ).toBe(1);
  });

  /** The customer's move email, rendered as it is sent. */
  async function moveEmail(bookingId: string) {
    const rows = await db()
      .collection<{ template: string; to: string; payload: Record<string, unknown> }>('emailOutbox')
      .find({ bookingId })
      .toArray();
    expect(rows.map((r) => r.template)).toEqual(['bookingRescheduled']);
    const row = rows[0];
    if (!row) throw new Error('no email');
    expect(row.to).toBe('c@example.com');
    return renderTemplate(row.template as 'bookingRescheduled', row.payload, row.to, 'k', {
      appBaseUrl: 'https://example.com',
      now: new Date(),
    });
  }

  it("lists each chair it can move to with that chair's price and time for the booking", async () => {
    // Dontrise's own haircut: $50 and 75 minutes.
    const booking = await seedBooking(dontrise, '12:00', cut, {
      priceCents: 5000,
      durationMinutes: 75,
    });
    const conflict = await timeOff(dontrise);
    expect(conflict.status).toBe(409);
    const [affected] = apiErrorSchema.parse(conflict.body).error.affected ?? [];
    expect(affected).toMatchObject({
      bookingId: booking._id,
      totalPriceCents: 5000,
      durationMinutes: 75,
    });
    const options = new Map((affected?.moveOptions ?? []).map((o) => [o.staffId, o]));
    // No override: the shop's $40 and 45 minutes. Nelly's own: $45.
    expect(options.get(drew)).toMatchObject({
      staffName: 'Drew',
      totalPriceCents: 4000,
      durationMinutes: 45,
    });
    expect(options.get(lee)).toMatchObject({ totalPriceCents: 4000, durationMinutes: 45 });
    expect(options.get(nelly)).toMatchObject({ totalPriceCents: 4500, durationMinutes: 45 });
  });

  it("a move from a barber with his own price to one without takes the new barber's price, time, end, locks and email", async () => {
    const booking = await seedBooking(dontrise, '12:00', cut, {
      priceCents: 5000,
      durationMinutes: 75,
    });
    const done = await timeOff(dontrise, [
      { bookingId: booking._id, action: 'move', toStaffId: drew },
    ]);
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    const after = await bookingsRepo.findBookingById(booking._id);
    expect(after).toMatchObject({
      staffId: drew,
      totalPriceCents: 4000,
      durationMinutes: 45,
      bufferMinutes: 10,
      startAt: booking.startAt,
      endAt: new Date(slotAt(THU, '12:45')),
    });
    expect(after?.services).toEqual([
      expect.objectContaining({
        serviceId: cut,
        priceCents: 4000,
        durationMinutes: 45,
        priceFrom: false,
      }),
    ]);
    // Drew holds 12:00 to 12:55 (45 minutes and the 10 minute gap): four blocks, Dontrise none.
    const locks = await slotLocksRepo.listSlotLocksForHolder(booking._id);
    expect(locks.map((l) => [l.staffId, l.slotStart.toISOString()])).toEqual(
      ['12:00', '12:15', '12:30', '12:45'].map((t) => [drew, slotAt(THU, t)]),
    );
    const audit = await db()
      .collection('auditLog')
      .findOne({ action: 'booking.move', entityId: booking._id });
    expect(audit?.before).toMatchObject({ staffId: dontrise, totalPriceCents: 5000 });
    expect(audit?.after).toMatchObject({
      staffId: drew,
      totalPriceCents: 4000,
      durationMinutes: 45,
    });
    const mail = await moveEmail(booking._id);
    expect(mail.text).toContain('with Drew');
    expect(mail.text).toContain('Haircut: $40 (45 min)');
    expect(mail.text).toContain('Total: $40');
    expect(mail.text).not.toContain('$50');
    expect(mail.text).not.toMatch(/from \$/i);
  });

  it('the reverse: a move to the barber with his own price takes his $50 and 75 minutes', async () => {
    const booking = await seedBooking(drew, '12:00');
    expect(booking.totalPriceCents).toBe(4000);
    const done = await timeOff(drew, [
      { bookingId: booking._id, action: 'move', toStaffId: dontrise },
    ]);
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    const after = await bookingsRepo.findBookingById(booking._id);
    expect(after).toMatchObject({
      staffId: dontrise,
      totalPriceCents: 5000,
      durationMinutes: 75,
      endAt: new Date(slotAt(THU, '13:15')),
    });
    expect(after?.services[0]).toMatchObject({ priceCents: 5000, durationMinutes: 75 });
    // 12:00 to 13:25 on Dontrise: six blocks.
    const locks = await slotLocksRepo.listSlotLocksForHolder(booking._id);
    expect(locks.map((l) => l.slotStart.toISOString())).toEqual(
      ['12:00', '12:15', '12:30', '12:45', '13:00', '13:15'].map((t) => slotAt(THU, t)),
    );
    expect(new Set(locks.map((l) => l.staffId))).toEqual(new Set([dontrise]));
    const mail = await moveEmail(booking._id);
    expect(mail.text).toContain('with Dontrise');
    expect(mail.text).toContain('Haircut: $50 (75 min)');
    expect(mail.text).toContain('Total: $50');
    expect(mail.subject).toContain('Moved');
  });

  it('a longer length that does not fit is not offered, and asking for it changes nothing', async () => {
    // Drew's 45 minutes would end before Dontrise's 13:00 client; Dontrise's own 75 would not.
    const booking = await seedBooking(drew, '12:00');
    await seedBooking(dontrise, '13:00');
    const conflict = await timeOff(drew);
    expect(conflict.status).toBe(409);
    const [affected] = apiErrorSchema.parse(conflict.body).error.affected ?? [];
    const ids = (affected?.moveOptions ?? []).map((o) => o.staffId);
    expect(ids).not.toContain(dontrise);
    expect(ids).toContain(lee);
    const refused = await timeOff(drew, [
      { bookingId: booking._id, action: 'move', toStaffId: dontrise },
    ]);
    expect(refused.status).toBe(409);
    const after = await bookingsRepo.findBookingById(booking._id);
    expect(after).toMatchObject({ staffId: drew, totalPriceCents: 4000, durationMinutes: 45 });
    expect(
      new Set((await slotLocksRepo.listSlotLocksForHolder(booking._id)).map((l) => l.staffId)),
    ).toEqual(new Set([drew]));
    expect(await db().collection('timeBlocks').countDocuments({})).toBe(0);
    expect(await db().collection('emailOutbox').countDocuments({ bookingId: booking._id })).toBe(0);
  });

  it('refuses a chair that does not do the service, and changes nothing', async () => {
    const booking = await seedBooking(lee, '12:00');
    const all = await staffRepo.listStaff({ includeDeleted: false });
    const other = all.find((s) => s._id !== lee && !s.serviceIds.includes(cut));
    // Take the service away from a chair if the seed gives everyone the cut.
    const target = other ?? all.find((s) => s._id === nelly);
    if (!other && target) await staffRepo.updateStaff(target._id, { serviceIds: [] }, new Date());
    const refused = await timeOff(lee, [
      { bookingId: booking._id, action: 'move', toStaffId: target?._id },
    ]);
    expect(refused.status).toBe(409);
    expect((await bookingsRepo.findBookingById(booking._id))?.staffId).toBe(lee);
    expect(await db().collection('timeBlocks').countDocuments({})).toBe(0);
    if (!other && target)
      await staffRepo.updateStaff(
        target._id,
        { serviceIds: all.find((s) => s._id === nelly)?.serviceIds ?? [] },
        new Date(),
      );
  });

  it('a move needs a chair, and a chair means a move', async () => {
    const booking = await seedBooking(lee, '12:00');
    const bad = await timeOff(lee, [{ bookingId: booking._id, action: 'move' }]);
    expect(bad.status).toBe(400);
    const worse = await timeOff(lee, [
      { bookingId: booking._id, action: 'keep', toStaffId: nelly },
    ]);
    expect(worse.status).toBe(400);
  });

  it('two changes moving into the same free time: one wins, the other is undone whole', async () => {
    const a = await seedBooking(lee, '12:00');
    const b = await seedBooking(nelly, '12:00');
    // Both want Drew's 12:00. Her slot can be held by only one of them.
    const [first, second] = await Promise.all([
      timeOff(lee, [{ bookingId: a._id, action: 'move', toStaffId: drew }]),
      timeOff(nelly, [{ bookingId: b._id, action: 'move', toStaffId: drew }]),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(201);
    expect([409, 500]).not.toContain(statuses[0]);
    expect(statuses[1]).toBe(409);
    const winner = first.status === 201 ? a : b;
    const loser = first.status === 201 ? b : a;
    expect((await bookingsRepo.findBookingById(winner._id))?.staffId).toBe(drew);
    // The loser's whole change rolled back: still on its own chair, its time off never saved.
    expect((await bookingsRepo.findBookingById(loser._id))?.staffId).toBe(
      loser._id === a._id ? lee : nelly,
    );
    expect(await db().collection('timeBlocks').countDocuments({})).toBe(1);
    // Exactly one booking holds Drew's 12:00 locks.
    const held = await slotLocksRepo.listSlotLocksForStaff(drew, {
      start: new Date(slotAt(THU, '12:00')),
      end: new Date(slotAt(THU, '13:00')),
    });
    expect(new Set(held.map((l) => l.holderId)).size).toBe(1);
  });

  it('a barber may keep but not move (the rule holds even below the barber routes)', async () => {
    const booking = await seedBooking(lee, '12:00');
    const barber = {
      userId: lee,
      role: 'barber' as const,
      staffId: lee,
      sessionId: newId(),
      email: '',
      mustChangePassword: false,
    };
    const error = await createTimeBlock(
      barber,
      { kind: 'chair', staffId: lee },
      {
        staffId: lee,
        kind: 'timeOff',
        startAt: slotAt(THU, '08:00'),
        endAt: slotAt(THU, '21:00'),
        resolutions: [{ bookingId: booking._id, action: 'move', toStaffId: nelly }],
      },
      { requestId: 'test', now: new Date() },
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'FORBIDDEN' });
    expect((error as Error).message).toContain('cancel or move');
    expect((await bookingsRepo.findBookingById(booking._id))?.staffId).toBe(lee);
  });
});
