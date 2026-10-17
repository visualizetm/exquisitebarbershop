import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../server/lib/ids';
import { shopSettingsRepo, timeBlocksRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { shopSettingsSeed, serviceSeedId, staffSeedId } from '../../seed/shop';
import { myScheduleResponseSchema } from '../../shared/api/admin';
import { apiErrorSchema } from '../../shared/api/errors';
import { createLogin, sessionCookie } from '../helpers/auth';
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
let marcusCookie: string;
let deeBooking: { id: string; token: string };
let marcusBooking: { id: string };
let deeBlockId: string;
const WED = nextDate(3, 3);
const cutId = serviceSeedId('classic-cut');

beforeAll(async () => {
  await runSeed(db(), NOW);
  await shopSettingsRepo.updateShopSettings(
    { ...shopSettingsSeed, permissions: { barbersCanBlockTime: true } },
    new Date(),
  );
  server = await startTestServer();
  const marcus = await createLogin({ role: 'barber', staffId: staffSeedId('marcus') });
  marcusCookie = await sessionCookie(marcus._id);
  deeBooking = await bookPublic(server.baseUrl, {
    staff: 'dee',
    serviceIds: [cutId],
    startAt: slotAt(WED, '10:00'),
  });
  marcusBooking = await bookPublic(server.baseUrl, {
    staff: 'marcus',
    serviceIds: [cutId],
    startAt: slotAt(WED, '11:00'),
  });
  const block = await timeBlocksRepo.insertTimeBlock(
    {
      staffId: staffSeedId('dee'),
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

const asMarcus = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie: marcusCookie },
    ...(body === undefined ? {} : { body }),
  });

describe('a barber cannot reach another chair', () => {
  it("another barber's booking reads as not found, exactly like a made-up id", async () => {
    const other = await asMarcus('GET', `/api/me/bookings/${deeBooking.id}`);
    const madeUp = await asMarcus('GET', `/api/me/bookings/${newId()}`);
    expect(other.status).toBe(404);
    expect(madeUp.status).toBe(404);
    expect(apiErrorSchema.parse(other.body).error.message).toBe(
      apiErrorSchema.parse(madeUp.body).error.message,
    );
    expect((await asMarcus('GET', `/api/me/bookings/${marcusBooking.id}`)).status).toBe(200);
  });

  it("cannot change the status of another barber's booking", async () => {
    const res = await asMarcus('POST', `/api/me/bookings/${deeBooking.id}/status`, {
      status: 'completed',
    });
    expect(res.status).toBe(404);
    const stored = await db()
      .collection<{ _id: string; status: string }>('bookings')
      .findOne({ _id: deeBooking.id });
    expect(stored?.status).toBe('confirmed');
  });

  it('cannot cancel even its own bookings through the barber API', async () => {
    const res = await asMarcus('POST', `/api/me/bookings/${marcusBooking.id}/status`, {
      status: 'cancelled',
    });
    expect(res.status).toBe(409);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('INVALID_TRANSITION');
  });

  it("cannot delete another barber's time block", async () => {
    const res = await asMarcus('DELETE', `/api/me/time-blocks/${deeBlockId}`, {});
    expect(res.status).toBe(404);
    expect(await timeBlocksRepo.findTimeBlockById(deeBlockId)).not.toBeNull();
  });

  it('a staffId smuggled into a block request is ignored: the block lands on the own chair', async () => {
    const res = await asMarcus('POST', '/api/me/time-blocks', {
      staffId: staffSeedId('dee'),
      kind: 'block',
      startAt: slotAt(WED, '13:00'),
      endAt: slotAt(WED, '13:30'),
    });
    expect(res.status).toBe(201);
    expect((res.body as { timeBlock: { staffId: string } }).timeBlock.staffId).toBe(
      staffSeedId('marcus'),
    );
  });

  it('the own schedule never contains another chair, whatever the query says', async () => {
    const res = await asMarcus('GET', `/api/me/schedule?date=${WED}&staffId=${staffSeedId('dee')}`);
    const parsed = myScheduleResponseSchema.parse(res.body);
    expect(parsed.staff.id).toBe(staffSeedId('marcus'));
    const all = parsed.days.flatMap((d) => [
      ...d.bookings.map((b) => b.staff.id),
      ...d.blocks.map((b) => b.staffId),
    ]);
    expect(all.every((id) => id === staffSeedId('marcus'))).toBe(true);
    expect(parsed.days[0]?.bookings.map((b) => b.id)).toContain(marcusBooking.id);
  });

  it('owner routes refuse a barber with 403, including by id', async () => {
    for (const path of [
      `/api/admin/bookings/${deeBooking.id}`,
      `/api/admin/schedule?date=${WED}&staffId=${staffSeedId('dee')}`,
      `/api/admin/customers?phone=2155550100`,
    ]) {
      const res = await asMarcus('GET', path);
      expect(res.status, path).toBe(403);
    }
    const cancel = await asMarcus('POST', `/api/admin/bookings/${deeBooking.id}/cancel`, {
      notify: false,
    });
    expect(cancel.status).toBe(403);
  });

  it('a barber may keep but never cancel a customer booking through a conflict', async () => {
    const keepOnly = await asMarcus('POST', '/api/me/time-blocks', {
      kind: 'timeOff',
      startAt: slotAt(WED, '11:00'),
      endAt: slotAt(WED, '11:30'),
      resolutions: [{ bookingId: marcusBooking.id, action: 'cancel' }],
    });
    expect(keepOnly.status).toBe(403);
    const conflict = await asMarcus('POST', '/api/me/time-blocks', {
      kind: 'timeOff',
      startAt: slotAt(WED, '11:00'),
      endAt: slotAt(WED, '11:30'),
    });
    expect(conflict.status).toBe(409);
    expect(apiErrorSchema.parse(conflict.body).error.affected?.map((a) => a.bookingId)).toEqual([
      marcusBooking.id,
    ]);
  });
});

describe('a manage token is not a session', () => {
  it('is refused by every admin and barber route in any position', async () => {
    const token = deeBooking.token;
    for (const headers of [
      { authorization: `Bearer ${token}` },
      { cookie: `__Host-exq_session=${token}` },
      { cookie: `token=${token}` },
    ]) {
      expect(
        (await call(server.baseUrl, 'GET', `/api/admin/bookings/${deeBooking.id}`, { headers }))
          .status,
      ).toBe(401);
      expect((await call(server.baseUrl, 'GET', '/api/me/schedule', { headers })).status).toBe(401);
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

describe('barber block permission', () => {
  it('is refused while the owner setting is off', async () => {
    await shopSettingsRepo.updateShopSettings(
      { ...shopSettingsSeed, permissions: { barbersCanBlockTime: false } },
      new Date(),
    );
    const res = await asMarcus('POST', '/api/me/time-blocks', {
      kind: 'block',
      startAt: slotAt(WED, '16:00'),
      endAt: slotAt(WED, '16:30'),
    });
    expect(res.status).toBe(403);
    const days = await asMarcus('GET', `/api/me/schedule?date=${WED}`);
    expect(myScheduleResponseSchema.parse(days.body).canBlockTime).toBe(false);
  });
});
