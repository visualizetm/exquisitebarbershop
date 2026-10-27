import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { allRoutes } from '../../server/http/app';
import { newId } from '../../server/lib/ids';
import { bookingsRepo, kioskDevicesRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import { kioskBoardResponseSchema, kioskNowResponseSchema } from '../../shared/api/kiosk';
import { weeklyHoursRepo } from '../../server/repos';
import { createLogin, sessionCookie } from '../helpers/auth';
import {
  call,
  idemKey,
  nextDate,
  phone,
  slotAt,
  startTestServer,
  type TestServer,
} from '../helpers/bookingApi';
import type { WeekHours } from '../../shared/schemas/common';
import { NOW, useTestDb } from '../helpers/db';

/** The locked front desk tablet: pairing, what it may reach, and what it may never say. */
process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
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
// The clock is frozen on a Tuesday at 1 PM shop time (the D12-88 pattern), so NOW is always inside the day.
const FROZEN_NOW = new Date(slotAt(nextDate(2, 1), '13:00'));

function cookieOf(res: { headers: Headers }): string {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith('__Host-exq_kiosk=')) ?? '';
  return raw.split(';')[0] ?? '';
}

async function setup(name = 'Front desk', exitPin = '482915') {
  const res = await call(server.baseUrl, 'POST', '/api/admin/kiosk/devices', {
    headers: { cookie: ownerCookie },
    body: { name, exitPin },
  });
  expect(res.status).toBe(201);
  const body = res.body as { code: string; device: { id: string } };
  return body;
}

async function pair(code: string) {
  return call(server.baseUrl, 'POST', '/api/kiosk/pair', { body: { code } });
}

beforeAll(async () => {
  await runSeed(db(), NOW);
  const owner = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  ownerCookie = await sessionCookie(owner._id);
  // Open all day on every chair, so NOW from the tablet always has somebody in.
  await weeklyHoursRepo.setShopHours(ALWAYS, NOW);
  for (const key of ['dontrise', 'drew', 'lee', 'nelly', 'iniya']) {
    await weeklyHoursRepo.setStaffHours(staffSeedId(key), ALWAYS, NOW);
  }
  vi.useFakeTimers({ toFake: ['Date'], now: FROZEN_NOW, shouldAdvanceTime: true });
  server = await startTestServer();
});
afterAll(async () => {
  vi.useRealTimers();
  await server.close();
});

describe('pairing', () => {
  it('a code pairs once, then is spent; the owner sees the tablet; unpairing revokes it', async () => {
    const { code, device } = await setup();
    const first = await pair(code);
    expect(first.status).toBe(200);
    const cookie = cookieOf(first);
    expect(cookie).toMatch(/^__Host-exq_kiosk=[A-Za-z0-9_-]{43}$/);
    const raw = first.headers.getSetCookie().find((c) => c.startsWith('__Host-exq_kiosk=')) ?? '';
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('Secure');
    expect(raw).toContain('SameSite=Strict');
    expect(raw).toContain(`Max-Age=${String(180 * 24 * 60 * 60)}`);

    const again = await pair(code);
    expect(again.status).toBe(401);

    const list = await call(server.baseUrl, 'GET', '/api/admin/kiosk/devices', {
      headers: { cookie: ownerCookie },
    });
    const devices = (list.body as { devices: { id: string; paired: boolean }[] }).devices;
    expect(devices.find((d) => d.id === device.id)?.paired).toBe(true);

    const board = await call(server.baseUrl, 'GET', '/api/kiosk/board', { headers: { cookie } });
    expect(board.status).toBe(200);

    const gone = await call(server.baseUrl, 'DELETE', `/api/admin/kiosk/devices/${device.id}`, {
      headers: { cookie: ownerCookie },
    });
    expect(gone.status).toBe(200);
    const after = await call(server.baseUrl, 'GET', '/api/kiosk/board', { headers: { cookie } });
    expect(after.status).toBe(401);
  });

  it('a code dies after ten minutes', async () => {
    const { code, device } = await setup('Old code');
    const stored = await kioskDevicesRepo.findKioskDeviceById(device.id);
    expect(stored?.pairCodeExpiresAt).not.toBeNull();
    // Push the clock past the code's life by moving its expiry into the past.
    const col = db().collection<{ _id: string }>('kioskDevices');
    await col.updateOne(
      { _id: device.id },
      { $set: { pairCodeExpiresAt: new Date(Date.now() - 1) } },
    );
    expect((await pair(code)).status).toBe(401);
  });

  it('five wrong codes from one address lock pairing for 15 minutes', async () => {
    const { code } = await setup('Locked');
    // One address throughout: the local socket can come as IPv4 or IPv6 from one call to the next.
    const from = { headers: { 'x-forwarded-for': '10.1.1.1' } };
    for (let i = 0; i < 5; i += 1) {
      const res = await call(server.baseUrl, 'POST', '/api/kiosk/pair', {
        body: { code: '000000' },
        ...from,
      });
      expect(res.status, String(i)).toBe(401);
    }
    const locked = await call(server.baseUrl, 'POST', '/api/kiosk/pair', {
      body: { code },
      ...from,
    });
    expect(locked.status).toBe(429);
    expect(apiErrorSchema.parse(locked.body).error.code).toBe('RATE_LIMITED');
  });
});

describe('what a paired tablet reaches', () => {
  let cookie: string;
  beforeAll(async () => {
    // A new address for the pairing limit: the lock above is per address.
    const { code } = await setup('Desk two');
    const res = await call(server.baseUrl, 'POST', '/api/kiosk/pair', {
      body: { code },
      headers: { 'x-forwarded-for': '10.9.9.9' },
    });
    expect(res.status).toBe(200);
    cookie = cookieOf(res);
  });

  it('every owner and team route refuses the tablet with 403', async () => {
    const failures: string[] = [];
    for (const route of allRoutes) {
      if (route.auth !== 'owner' && route.auth !== 'team') continue;
      // Showcase-only routes do not exist while DEMO_MODE is off (a plain 404 for everyone).
      if (route.demoOnly === true) continue;
      const path = route.path.replace(/:id\b/g, newId()).replace(/:slug\b/g, 'nobody');
      const res = await call(server.baseUrl, route.method, path, {
        headers: { cookie },
        ...(route.method === 'GET' ? {} : { body: {} }),
      });
      const parsed = apiErrorSchema.safeParse(res.body);
      if (res.status !== 403 || !parsed.success || parsed.data.error.code !== 'FORBIDDEN') {
        failures.push(`${route.method} ${route.path} -> ${String(res.status)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('no kiosk response carries a phone, an email or a full last name; a walk in never gets the offer', async () => {
    const bodies: string[] = [];
    const board = await call(server.baseUrl, 'GET', '/api/kiosk/board', { headers: { cookie } });
    expect(board.status).toBe(200);
    bodies.push(JSON.stringify(board.body));
    const parsed = kioskBoardResponseSchema.parse(board.body);
    expect(parsed.tiles.length).toBeGreaterThan(0);
    expect(parsed.line).toEqual([]);

    const now = await call(server.baseUrl, 'POST', '/api/kiosk/now', {
      headers: { cookie, 'idempotency-key': idemKey() },
      body: {
        serviceIds: [serviceSeedId('haircut')],
        staffId: staffSeedId('drew'),
        customer: { name: 'Walk Inperson', phone: phone() },
      },
    });
    expect(now.status).toBe(201);
    bodies.push(JSON.stringify(now.body));
    const done = kioskNowResponseSchema.parse(now.body);
    if (done.kind === 'booking') {
      const stored = await bookingsRepo.findBookingById(done.booking.id);
      expect(stored?.source).toBe('walkIn');
      expect(stored?.discounts).toEqual([]);
    }

    const lookup = await call(server.baseUrl, 'GET', '/api/kiosk/lookup?q=Walk', {
      headers: { cookie },
    });
    expect(lookup.status).toBe(200);
    bodies.push(JSON.stringify(lookup.body));
    const matches = (lookup.body as { matches: { id: string; name: string }[] }).matches;
    for (const m of matches) expect(m.name).toMatch(/^Walk I\.$/);
    const first = matches[0];
    if (first) {
      const arrived = await call(
        server.baseUrl,
        'POST',
        `/api/kiosk/bookings/${first.id}/arrived`,
        {
          headers: { cookie },
          body: {},
        },
      );
      bodies.push(JSON.stringify(arrived.body));
    }
    for (const raw of bodies) {
      // Record ids (24 hex) and timestamps carry digit runs of their own; everything else is scanned.
      const body = raw.replace(/[a-f0-9]{24}/g, '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '');
      expect(body).not.toContain('@');
      expect(body).not.toContain('+1');
      expect(body).not.toMatch(/\d{7,}/);
      expect(body).not.toContain('Inperson');
    }
  });
});
