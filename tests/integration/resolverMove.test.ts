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
const marcus = staffSeedId('marcus');
const dee = staffSeedId('dee');
const tre = staffSeedId('tre');
const cut = serviceSeedId('classic-cut');

const asOwner = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie: ownerCookie },
    ...(body === undefined ? {} : { body }),
  });

async function seedBooking(staffId: string, hhmm: string, serviceId = cut) {
  const startAt = new Date(slotAt(THU, hhmm));
  const service = await servicesRepo.findServiceById(serviceId);
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
    const booking = await seedBooking(marcus, '12:00');
    // Dee is busy at the same time, so she is not offered.
    await seedBooking(dee, '12:00');
    const conflict = await timeOff(marcus);
    expect(conflict.status).toBe(409);
    const [affected] = apiErrorSchema.parse(conflict.body).error.affected ?? [];
    expect(affected?.bookingId).toBe(booking._id);
    const ids = (affected?.moveOptions ?? []).map((o) => o.staffId);
    expect(ids).not.toContain(dee);
    expect(ids).not.toContain(marcus);
    expect(ids).toContain(tre);
    // Every chair offered does the service.
    for (const id of ids) {
      expect((await staffRepo.findStaffById(id))?.serviceIds).toContain(cut);
    }
  });

  it('moves the booking, its locks and its audit trail in one change', async () => {
    const booking = await seedBooking(marcus, '12:00');
    const done = await timeOff(marcus, [
      { bookingId: booking._id, action: 'move', toStaffId: tre },
    ]);
    expect(done.status, JSON.stringify(done.body)).toBe(201);
    expect((done.body as { moved: string[] }).moved).toEqual([booking._id]);
    const after = await bookingsRepo.findBookingById(booking._id);
    expect(after?.staffId).toBe(tre);
    expect(after?.status).toBe('confirmed');
    // The time did not change, so the customer's link version did not either.
    expect(after?.manageTokenVersion).toBe(1);
    const locks = await slotLocksRepo.listSlotLocksForHolder(booking._id);
    expect(locks.length).toBeGreaterThan(0);
    expect(new Set(locks.map((l) => l.staffId))).toEqual(new Set([tre]));
    expect(
      await db()
        .collection('auditLog')
        .countDocuments({ action: 'booking.move', entityId: booking._id }),
    ).toBe(1);
  });

  it('refuses a chair that does not do the service, and changes nothing', async () => {
    const booking = await seedBooking(marcus, '12:00');
    const all = await staffRepo.listStaff({ includeDeleted: false });
    const other = all.find((s) => s._id !== marcus && !s.serviceIds.includes(cut));
    // Take the service away from a chair if the seed gives everyone the cut.
    const target = other ?? all.find((s) => s._id === tre);
    if (!other && target) await staffRepo.updateStaff(target._id, { serviceIds: [] }, new Date());
    const refused = await timeOff(marcus, [
      { bookingId: booking._id, action: 'move', toStaffId: target?._id },
    ]);
    expect(refused.status).toBe(409);
    expect((await bookingsRepo.findBookingById(booking._id))?.staffId).toBe(marcus);
    expect(await db().collection('timeBlocks').countDocuments({})).toBe(0);
    if (!other && target)
      await staffRepo.updateStaff(
        target._id,
        { serviceIds: all.find((s) => s._id === tre)?.serviceIds ?? [] },
        new Date(),
      );
  });

  it('a move needs a chair, and a chair means a move', async () => {
    const booking = await seedBooking(marcus, '12:00');
    const bad = await timeOff(marcus, [{ bookingId: booking._id, action: 'move' }]);
    expect(bad.status).toBe(400);
    const worse = await timeOff(marcus, [
      { bookingId: booking._id, action: 'keep', toStaffId: tre },
    ]);
    expect(worse.status).toBe(400);
  });

  it('two changes moving into the same free time: one wins, the other is undone whole', async () => {
    const a = await seedBooking(marcus, '12:00');
    const b = await seedBooking(tre, '12:00');
    // Both want Dee's 12:00. Her slot can be held by only one of them.
    const [first, second] = await Promise.all([
      timeOff(marcus, [{ bookingId: a._id, action: 'move', toStaffId: dee }]),
      timeOff(tre, [{ bookingId: b._id, action: 'move', toStaffId: dee }]),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(201);
    expect([409, 500]).not.toContain(statuses[0]);
    expect(statuses[1]).toBe(409);
    const winner = first.status === 201 ? a : b;
    const loser = first.status === 201 ? b : a;
    expect((await bookingsRepo.findBookingById(winner._id))?.staffId).toBe(dee);
    // The loser's whole change rolled back: still on its own chair, its time off never saved.
    expect((await bookingsRepo.findBookingById(loser._id))?.staffId).toBe(
      loser._id === a._id ? marcus : tre,
    );
    expect(await db().collection('timeBlocks').countDocuments({})).toBe(1);
    // Exactly one booking holds Dee's 12:00 locks.
    const held = await slotLocksRepo.listSlotLocksForStaff(dee, {
      start: new Date(slotAt(THU, '12:00')),
      end: new Date(slotAt(THU, '13:00')),
    });
    expect(new Set(held.map((l) => l.holderId)).size).toBe(1);
  });

  it('a barber may keep but not move (the rule holds even below the barber routes)', async () => {
    const booking = await seedBooking(marcus, '12:00');
    const barber = {
      userId: marcus,
      role: 'barber' as const,
      staffId: marcus,
      sessionId: newId(),
      email: '',
      mustChangePassword: false,
    };
    const error = await createTimeBlock(
      barber,
      { kind: 'chair', staffId: marcus },
      {
        staffId: marcus,
        kind: 'timeOff',
        startAt: slotAt(THU, '08:00'),
        endAt: slotAt(THU, '21:00'),
        resolutions: [{ bookingId: booking._id, action: 'move', toStaffId: tre }],
      },
      { requestId: 'test', now: new Date() },
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'FORBIDDEN' });
    expect((error as Error).message).toContain('cancel or move');
    expect((await bookingsRepo.findBookingById(booking._id))?.staffId).toBe(marcus);
  });
});
