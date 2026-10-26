import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../server/lib/ids';
import { timeBlocksRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import { teamDayResponseSchema, teamWeekResponseSchema } from '../../shared/api/team';
import { teamCookie } from '../helpers/auth';
import {
  bookPublic,
  call,
  nextDate,
  slotAt,
  startTestServer,
  type TestServer,
} from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let leeCookie: string;
let deeBooking: { id: string; token: string };
let leeBooking: { id: string };
let deeBlockId: string;
const DREW_PHONE = '+12155550177';
const LEE_PHONE = '+12155550178';
const WED = nextDate(3, 3);
const cutId = serviceSeedId('haircut');

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  leeCookie = await teamCookie(staffSeedId('lee'));
  deeBooking = await bookPublic(server.baseUrl, {
    staff: 'drew',
    serviceIds: [cutId],
    startAt: slotAt(WED, '10:00'),
    phone: DREW_PHONE,
    email: 'drew.client@example.com',
  });
  leeBooking = await bookPublic(server.baseUrl, {
    staff: 'lee',
    serviceIds: [cutId],
    startAt: slotAt(WED, '11:00'),
    phone: LEE_PHONE,
    email: 'lee.client@example.com',
  });
  const block = await timeBlocksRepo.insertTimeBlock(
    {
      staffId: staffSeedId('drew'),
      kind: 'timeOff',
      startAt: new Date(slotAt(WED, '15:00')),
      endAt: new Date(slotAt(WED, '16:00')),
      reason: 'Errand',
      createdBy: { type: 'owner', userId: null, staffId: null },
    },
    new Date(),
  );
  deeBlockId = block._id;
});
afterAll(async () => {
  await server.close();
});

const asLee = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie: leeCookie },
    ...(body === undefined ? {} : { body }),
  });

describe('a barber cannot reach another chair', () => {
  it("another barber's booking reads as not found, exactly like a made-up id", async () => {
    const other = await asLee('POST', `/api/team/bookings/${deeBooking.id}/status`, {
      status: 'completed',
    });
    const madeUp = await asLee('POST', `/api/team/bookings/${newId()}/status`, {
      status: 'completed',
    });
    expect(other.status).toBe(404);
    expect(madeUp.status).toBe(404);
    expect(apiErrorSchema.parse(other.body).error.message).toBe(
      apiErrorSchema.parse(madeUp.body).error.message,
    );
    const stored = await db()
      .collection<{ _id: string; status: string }>('bookings')
      .findOne({ _id: deeBooking.id });
    expect(stored?.status).toBe('confirmed');
  });

  it("cannot add a note to another barber's booking", async () => {
    const res = await asLee('POST', `/api/team/bookings/${deeBooking.id}/note`, {
      notes: 'not mine',
    });
    expect(res.status).toBe(404);
    const stored = await db()
      .collection<{ _id: string; notes: string | null }>('bookings')
      .findOne({ _id: deeBooking.id });
    expect(stored?.notes).toBeNull();
  });

  it('cannot cancel, even its own booking: the barber API has no such status', async () => {
    const res = await asLee('POST', `/api/team/bookings/${leeBooking.id}/status`, {
      status: 'cancelled',
    });
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it("cannot delete another barber's time block", async () => {
    const res = await asLee('DELETE', `/api/team/time-blocks/${deeBlockId}`);
    expect(res.status).toBe(404);
    expect(await timeBlocksRepo.findTimeBlockById(deeBlockId)).not.toBeNull();
  });

  it('a staffId smuggled into a block request is ignored: the block lands on the own chair', async () => {
    const res = await asLee('POST', '/api/team/time-blocks', {
      staffId: staffSeedId('drew'),
      date: WED,
      start: '13:00',
      end: '13:30',
    });
    expect(res.status).toBe(201);
    expect((res.body as { timeBlock: { staffId: string } }).timeBlock.staffId).toBe(
      staffSeedId('lee'),
    );
  });

  it('a block over a booked client asks, and the barber API can only keep, never cancel', async () => {
    const conflict = await asLee('POST', '/api/team/time-blocks', {
      date: WED,
      start: '11:00',
      end: '11:30',
    });
    expect(conflict.status).toBe(409);
    expect(apiErrorSchema.parse(conflict.body).error.code).toBe('SCHEDULE_CONFLICT');
    expect(apiErrorSchema.parse(conflict.body).error.affected?.map((a) => a.bookingId)).toEqual([
      leeBooking.id,
    ]);
    // Nothing was saved: the booking is intact.
    const stored = await db()
      .collection<{ _id: string; status: string }>('bookings')
      .findOne({ _id: leeBooking.id });
    expect(stored?.status).toBe('confirmed');
  });

  it('the own week never contains another chair, and no client phone or email', async () => {
    const res = await asLee('GET', '/api/team/week');
    const parsed = teamWeekResponseSchema.parse(res.body);
    expect(parsed.days).toHaveLength(7);
    const text = JSON.stringify(res.body);
    for (const secret of [DREW_PHONE, LEE_PHONE, 'drew.client', 'lee.client', '2155550177']) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain(deeBooking.id);
    expect(text).not.toContain(staffSeedId('drew'));
    const today = teamDayResponseSchema.parse((await asLee('GET', '/api/team/today')).body);
    expect(JSON.stringify(today)).not.toContain(LEE_PHONE);
  });

  it('owner routes refuse a barber session, including by id', async () => {
    for (const path of [
      `/api/admin/bookings/${deeBooking.id}`,
      `/api/admin/schedule?date=${WED}&staffId=${staffSeedId('drew')}`,
      `/api/admin/customer-list`,
      `/api/admin/search?q=test`,
    ]) {
      const res = await asLee('GET', path);
      expect(res.status, path).toBe(401);
    }
    const cancel = await asLee('POST', `/api/admin/bookings/${deeBooking.id}/cancel`, {
      notify: false,
    });
    expect(cancel.status).toBe(401);
  });
});

describe('a manage token is not a session', () => {
  it('is refused by every admin and barber route in any position', async () => {
    const token = deeBooking.token;
    for (const headers of [
      { authorization: `Bearer ${token}` },
      { cookie: `__Host-exq_session=${token}` },
      { cookie: `__Host-exq_team=${token}` },
      { cookie: `token=${token}` },
    ]) {
      expect(
        (await call(server.baseUrl, 'GET', `/api/admin/bookings/${deeBooking.id}`, { headers }))
          .status,
      ).toBe(401);
      expect((await call(server.baseUrl, 'GET', '/api/team/today', { headers })).status).toBe(401);
    }
    expect(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/admin/bookings/${deeBooking.id}?token=${encodeURIComponent(token)}`,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await call(server.baseUrl, 'POST', `/api/admin/bookings/${deeBooking.id}/cancel`, {
          body: { token, notify: false },
        })
      ).status,
    ).toBe(401);
  });
});
