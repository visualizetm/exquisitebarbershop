import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../../server/db/transaction';
import { newId } from '../../server/lib/ids';
import {
  alertsRepo,
  bookingsRepo,
  servicesRepo,
  slotLocksRepo,
  timeBlocksRepo,
  weeklyHoursRepo,
} from '../../server/repos';
import type { Principal } from '../../server/http/types';
import { listAlertViews, resolveAlert } from '../../server/services/alerts';
import { runSeed } from '../../server/services/seedService';
import {
  blockTime,
  outToday,
  requestDaysOff,
  setBookingNote,
  setBookingStatus,
  teamDay,
  teamTimeOff,
  teamWeek,
} from '../../server/services/teamPortal';
import { serviceSeedId, shopHoursSeed, staffSeed, staffSeedId } from '../../seed/shop';
import { teamDayResponseSchema, teamWalkInResponseSchema } from '../../shared/api/team';
import { generateReferenceCode } from '../../shared/lib/referenceCode';
import { addMinutes, shopDayBounds } from '../../shared/lib/time';
import { createLogin, sessionCookie, teamCookie } from '../helpers/auth';
import {
  call,
  idemKey,
  nextDate,
  slotAt,
  startTestServer,
  type TestServer,
} from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
const THU = nextDate(4, 3);
const FRI = nextDate(5, 3);
const MORNING = new Date(slotAt(THU, '09:00'));
const marcus = staffSeedId('marcus');
const dee = staffSeedId('dee');
const cut = serviceSeedId('classic-cut');
const barber: Principal = {
  userId: marcus,
  role: 'barber',
  staffId: marcus,
  sessionId: newId(),
  email: '',
  mustChangePassword: false,
};
const meta = (now: Date = MORNING) => ({ requestId: 'test', now });

async function seedBooking(
  staffId: string,
  date: string,
  hhmm: string,
  who: { name?: string; status?: 'confirmed' | 'completed' | 'noShow' | 'cancelled' } = {},
) {
  const startAt = new Date(slotAt(date, hhmm));
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
          phone: '+12155550142',
          email: 'client@example.com',
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
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  for (const name of ['bookings', 'slotLocks', 'timeBlocks', 'auditLog', 'alerts']) {
    await db().collection(name).deleteMany({});
  }
  await weeklyHoursRepo.setShopHours(shopHoursSeed, new Date());
  for (const member of staffSeed)
    await weeklyHoursRepo.setStaffHours(staffSeedId(member.key), member.hours, new Date());
});

describe('Today', () => {
  it('lists the barber’s own day with the next client, counts, and never a phone or email', async () => {
    const first = await seedBooking(marcus, THU, '10:00', { name: 'First Client' });
    await seedBooking(marcus, THU, '11:00', { name: 'Second Client' });
    await seedBooking(marcus, THU, '12:00', { name: 'Walked Out', status: 'cancelled' });
    await seedBooking(dee, THU, '10:00', { name: 'Dees Client' });
    const day = teamDayResponseSchema.parse(await teamDay(barber, MORNING));
    expect(day.date).toBe(THU);
    expect(day.bookings.map((b) => b.customerName)).toEqual(['First Client', 'Second Client']);
    expect(day.nextUp?.id).toBe(first._id);
    expect(day.counts).toEqual({ total: 2, done: 0, noShow: 0, left: 2 });
    expect(day.isOut).toBe(false);
    const text = JSON.stringify(day);
    for (const secret of ['2155550142', 'client@example.com', 'Dees Client', dee]) {
      expect(text).not.toContain(secret);
    }
  });

  it('Done and No show move the counts and the next client on, and Undo puts them back', async () => {
    const a = await seedBooking(marcus, THU, '10:00', { name: 'A' });
    const b = await seedBooking(marcus, THU, '11:00', { name: 'B' });
    await setBookingStatus(barber, a._id, 'completed', meta());
    let day = await teamDay(barber, MORNING);
    expect(day.counts).toEqual({ total: 2, done: 1, noShow: 0, left: 1 });
    expect(day.nextUp?.id).toBe(b._id);
    await setBookingStatus(barber, b._id, 'noShow', meta());
    day = await teamDay(barber, MORNING);
    expect(day.counts).toEqual({ total: 2, done: 1, noShow: 1, left: 0 });
    expect(day.nextUp).toBeNull();
    const undone = await setBookingStatus(barber, b._id, 'confirmed', meta());
    expect(undone.status).toBe('confirmed');
    expect((await teamDay(barber, MORNING)).nextUp?.id).toBe(b._id);
  });

  it('adds a note that the owner sees on the booking', async () => {
    const a = await seedBooking(marcus, THU, '10:00');
    const view = await setBookingNote(barber, a._id, '  Prefers a #2 guard  ', meta());
    expect(view.notes).toBe('Prefers a #2 guard');
    expect((await bookingsRepo.findBookingById(a._id))?.notes).toBe('Prefers a #2 guard');
    const cleared = await setBookingNote(barber, a._id, null, meta());
    expect(cleared.notes).toBeNull();
  });

  it('a week shows seven days with a count each, grouped by day', async () => {
    await seedBooking(marcus, THU, '10:00');
    await seedBooking(marcus, THU, '11:00');
    await seedBooking(marcus, FRI, '10:00');
    const week = await teamWeek(barber, MORNING);
    expect(week.days).toHaveLength(7);
    expect(week.days[0]?.date).toBe(THU);
    expect(week.days.find((d) => d.date === THU)?.count).toBe(2);
    expect(week.days.find((d) => d.date === FRI)?.count).toBe(1);
  });
});

describe('I’m out today', () => {
  it('sets the day off, cancels and moves nothing, and raises one alert for the owner', async () => {
    const a = await seedBooking(marcus, THU, '12:00', { name: 'Noon' });
    const b = await seedBooking(marcus, THU, '14:00', { name: 'Afternoon' });
    const first = await outToday(barber, meta());
    expect(first).toEqual({ clients: 2 });
    for (const booking of [a, b]) {
      const stored = await bookingsRepo.findBookingById(booking._id);
      expect(stored?.status).toBe('confirmed');
      expect(stored?.staffId).toBe(marcus);
    }
    const day = shopDayBounds(THU);
    const blocks = await timeBlocksRepo.listTimeBlocksForStaff(marcus, day);
    expect(blocks.map((x) => x.kind)).toEqual(['dayOff']);
    expect(blocks[0]?.createdBy).toEqual({ type: 'barber', userId: null, staffId: marcus });
    const alerts = await alertsRepo.listOpenAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: 'barberOut',
      staffId: marcus,
      fromDate: THU,
      toDate: THU,
    });
    const views = await listAlertViews(MORNING);
    expect(views[0]).toMatchObject({ staffName: 'Marcus', affectedCount: 2 });
    expect((await teamDay(barber, MORNING)).isOut).toBe(true);

    // Pressing it again changes nothing and adds no second alert.
    expect(await outToday(barber, meta())).toEqual({ clients: 0 });
    expect(await alertsRepo.listOpenAlerts()).toHaveLength(1);
    expect(await timeBlocksRepo.listTimeBlocksForStaff(marcus, day)).toHaveLength(1);
  });

  it('the owner then decides each client: one cancelled, one kept, and the alert closes', async () => {
    const a = await seedBooking(marcus, THU, '12:00', { name: 'Noon' });
    const b = await seedBooking(marcus, THU, '14:00', { name: 'Afternoon' });
    await outToday(barber, meta());
    const [alert] = await alertsRepo.listOpenAlerts();
    const owner = {
      userId: (await createLogin({ role: 'owner', staffId: null }))._id,
      role: 'owner' as const,
      staffId: null,
      sessionId: newId(),
      email: 'o@example.com',
      mustChangePassword: false,
    };
    const done = await resolveAlert(
      owner,
      alert?._id ?? '',
      [
        { bookingId: a._id, action: 'cancel' },
        { bookingId: b._id, action: 'keep' },
      ],
      meta(),
    );
    expect(done.body.cancelled).toEqual([a._id]);
    expect(done.body.kept).toEqual([b._id]);
    expect((await bookingsRepo.findBookingById(a._id))?.status).toBe('cancelled');
    expect((await bookingsRepo.findBookingById(b._id))?.status).toBe('confirmed');
    expect(await alertsRepo.listOpenAlerts()).toHaveLength(0);
  });

  it('with no clients booked it just sets the day off, with no alert', async () => {
    expect(await outToday(barber, meta())).toEqual({ clients: 0 });
    expect(await alertsRepo.listOpenAlerts()).toHaveLength(0);
    expect((await teamDay(barber, MORNING)).isOut).toBe(true);
  });
});

describe('days off ahead', () => {
  it('apply right away when those days are empty', async () => {
    const result = await requestDaysOff(
      barber,
      { fromDate: FRI, toDate: FRI, reason: 'Wedding' },
      meta(),
    );
    expect(result).toEqual({ applied: true, clients: 0 });
    const blocks = await timeBlocksRepo.listTimeBlocksForStaff(marcus, shopDayBounds(FRI));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'timeOff', reason: 'Wedding' });
    expect(await alertsRepo.listOpenAlerts()).toHaveLength(0);
  });

  it('become a request when clients are booked, and nothing changes until the owner decides', async () => {
    const booked = await seedBooking(marcus, FRI, '12:00');
    const result = await requestDaysOff(barber, { fromDate: FRI, toDate: FRI }, meta());
    expect(result).toEqual({ applied: false, clients: 1 });
    expect(await timeBlocksRepo.listTimeBlocksForStaff(marcus, shopDayBounds(FRI))).toHaveLength(0);
    const [alert] = await alertsRepo.listOpenAlerts();
    expect(alert).toMatchObject({ kind: 'timeOffRequest', staffId: marcus, fromDate: FRI });
    const listed = await teamTimeOff(barber, MORNING);
    expect(listed.requests).toEqual([{ id: alert?._id, fromDate: FRI, toDate: FRI, reason: null }]);
    expect(listed.blocks).toEqual([]);

    // The owner approves it, keeping the client as an exception.
    const owner = {
      userId: (await createLogin({ role: 'owner', staffId: null }))._id,
      role: 'owner' as const,
      staffId: null,
      sessionId: newId(),
      email: 'o@example.com',
      mustChangePassword: false,
    };
    await resolveAlert(
      owner,
      alert?._id ?? '',
      [{ bookingId: booked._id, action: 'keep' }],
      meta(),
    );
    expect(await timeBlocksRepo.listTimeBlocksForStaff(marcus, shopDayBounds(FRI))).toHaveLength(1);
    expect((await teamTimeOff(barber, MORNING)).requests).toEqual([]);
  });

  it('a block of time over a client asks first, over free time it just applies', async () => {
    await seedBooking(marcus, THU, '12:00');
    await expect(
      blockTime(barber, { date: THU, start: '12:00', end: '12:30' }, meta()),
    ).rejects.toMatchObject({ code: 'SCHEDULE_CONFLICT' });
    const done = await blockTime(barber, { date: THU, start: '15:00', end: '15:30' }, meta());
    expect(done.body.timeBlock.kind).toBe('block');
    const listed = await teamTimeOff(barber, MORNING);
    expect(listed.blocks.map((b) => b.kind)).toEqual(['block']);
  });
});

describe('the walk-in button', () => {
  it('books a walk-in on the barber’s own chair and replays safely', async () => {
    const cookie = await teamCookie(marcus);
    const key = idemKey();
    const send = () =>
      call(server.baseUrl, 'POST', '/api/team/walk-ins', {
        headers: { cookie, 'idempotency-key': key },
        body: { name: 'Walk In Guest', phone: '2155550188', serviceIds: [cut] },
      });
    const first = await send();
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const view = teamWalkInResponseSchema.parse(first.body);
    expect(view.booking).toMatchObject({ customerName: 'Walk In Guest', source: 'walkIn' });
    const stored = await bookingsRepo.findBookingById(view.booking.id);
    expect(stored?.staffId).toBe(marcus);
    // No phone number or email in what the barber gets back.
    expect(JSON.stringify(first.body)).not.toContain('2155550188');
    const replay = await send();
    expect(teamWalkInResponseSchema.parse(replay.body).booking.id).toBe(view.booking.id);
    expect(await db().collection('bookings').countDocuments({ staffId: marcus })).toBe(1);
    // It needs the Idempotency-Key header and at least one service.
    expect(
      (
        await call(server.baseUrl, 'POST', '/api/team/walk-ins', {
          headers: { cookie },
          body: { name: 'X', phone: '2155550188', serviceIds: [cut] },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(server.baseUrl, 'POST', '/api/team/walk-ins', {
          headers: { cookie, 'idempotency-key': idemKey() },
          body: { name: 'X', phone: '2155550188', serviceIds: [] },
        })
      ).status,
    ).toBe(400);
  });

  it('is not open to the owner’s login or a stranger', async () => {
    const ownerCookie = await sessionCookie(
      (await createLogin({ role: 'owner', staffId: null }))._id,
    );
    for (const headers of [{}, { cookie: ownerCookie }]) {
      const res = await call(server.baseUrl, 'POST', '/api/team/walk-ins', {
        headers: { ...headers, 'idempotency-key': idemKey() },
        body: { name: 'X', phone: '2155550188', serviceIds: [cut] },
      });
      expect(res.status).toBe(401);
    }
  });
});
