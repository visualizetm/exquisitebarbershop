import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closuresRepo,
  shopSettingsRepo,
  timeBlocksRepo,
  weeklyHoursRepo,
} from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import {
  serviceSeedId,
  servicesSeed,
  shopSettingsSeed,
  staffSeed,
  staffSeedId,
} from '../../seed/shop';
import {
  availabilityDaysResponseSchema,
  nextOpeningsResponseSchema,
} from '../../shared/api/availability';
import { staffOpeningsResponseSchema } from '../../shared/api/public';
import { shopDateOf, shopDayBounds, shopDayStart } from '../../shared/lib/time';
import type { WeekHours } from '../../shared/schemas/common';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();
let server: TestServer;
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
const marcus = staffSeedId('marcus');
const marcusSeed = staffSeed.find((s) => s.key === 'marcus')?.input ?? {
  serviceIds: [] as string[],
};
const dee = staffSeedId('dee');

const next = async () =>
  nextOpeningsResponseSchema.parse(
    (await call(server.baseUrl, 'GET', '/api/availability/next')).body,
  );

beforeAll(async () => {
  await runSeed(db(), NOW);
  await weeklyHoursRepo.setShopHours(ALWAYS, new Date());
  for (const key of ['marcus', 'dee']) {
    await weeklyHoursRepo.setStaffHours(staffSeedId(key), ALWAYS, new Date());
  }
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

describe('GET /api/availability/next', () => {
  it('lists every chair on the site with a status and the next open time', async () => {
    const res = await call(server.baseUrl, 'GET', '/api/availability/next');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=30');
    const body = nextOpeningsResponseSchema.parse(res.body);
    expect(body.date).toBe(shopDateOf(new Date()));
    expect(body.chairs.length).toBeGreaterThanOrEqual(6);
    const m = body.chairs.find((c) => c.staff.id === marcus);
    expect(m?.status).toBe('in');
    expect(m?.nextOpen).not.toBeNull();
    expect(m?.nextOpenLabel).toMatch(/^(Tomorrow )?\d{1,2}:\d{2} [AP]M$/);
    // The shortest service Marcus offers (ties broken by display order).
    const offered = servicesSeed.filter((svc) =>
      marcusSeed.serviceIds.includes(serviceSeedId(svc.key)),
    );
    const shortest = [...offered].sort(
      (a, b) =>
        a.input.durationMinutes - b.input.durationMinutes || a.input.sortOrder - b.input.sortOrder,
    )[0];
    expect(m?.serviceId).toBe(serviceSeedId(shortest?.key ?? ''));
    expect(new Date(m?.nextOpen ?? 0).getTime()).toBeGreaterThanOrEqual(Date.now() + 59 * 60_000);
  });

  it("honours the owner's next-open service and reads off and closed days", async () => {
    await shopSettingsRepo.updateShopSettings(
      { ...shopSettingsSeed, nextOpenServiceId: serviceSeedId('classic-cut') },
      new Date(),
    );
    expect((await next()).chairs.find((c) => c.staff.id === marcus)?.serviceId).toBe(
      serviceSeedId('classic-cut'),
    );
    const today = shopDateOf(new Date());
    const bounds = shopDayBounds(today);
    await timeBlocksRepo.insertTimeBlock(
      {
        staffId: dee,
        kind: 'dayOff',
        startAt: bounds.start,
        endAt: bounds.end,
        reason: null,
        createdBy: { type: 'owner', userId: null, staffId: null },
      },
      new Date(),
    );
    const afterDayOff = await next();
    expect(afterDayOff.chairs.find((c) => c.staff.id === dee)?.status).toBe('off');
    expect(afterDayOff.chairs.find((c) => c.staff.id === marcus)?.status).toBe('in');
    await closuresRepo.upsertClosure(
      { date: today, kind: 'closed', intervals: [], label: 'Test' },
      new Date(),
    );
    const closed = await next();
    expect(closed.chairs.every((c) => c.status === 'closed')).toBe(true);
    const m = closed.chairs.find((c) => c.staff.id === marcus);
    expect(m?.nextOpenLabel?.startsWith('Tomorrow ')).toBe(true);
    await db().collection('closures').deleteMany({});
  });
});

describe('GET /api/staff/:slug/openings', () => {
  it('returns the next starts in order, by alias too, and 404 for a stranger', async () => {
    const res = await call(server.baseUrl, 'GET', '/api/staff/marcus/openings?count=3');
    expect(res.status).toBe(200);
    const body = staffOpeningsResponseSchema.parse(res.body);
    expect(body.staff.slug).toBe('marcus');
    expect(body.service?.id).toBe(serviceSeedId('classic-cut'));
    expect(body.openings).toHaveLength(3);
    const times = body.openings.map((o) => new Date(o.startAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(body.openings[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await call(server.baseUrl, 'GET', '/api/staff/nobody/openings')).status).toBe(404);
    expect((await call(server.baseUrl, 'GET', '/api/staff/marcus/openings?count=99')).status).toBe(
      400,
    );
  });

  it('the days endpoint now says how many times each day has', async () => {
    const from = shopDayStart(shopDateOf(new Date())).plus({ days: 3 }).toISODate() ?? '';
    const body = availabilityDaysResponseSchema.parse(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/availability/days?serviceIds=${serviceSeedId('classic-cut')}&staff=marcus&from=${from}&to=${from}`,
        )
      ).body,
    );
    expect(body.days[0]?.count).toBeGreaterThan(20);
  });
});
