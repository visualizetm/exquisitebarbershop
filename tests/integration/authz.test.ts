import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allRoutes } from '../../server/http/app';
import type { AuthLevel } from '../../server/http/types';
import { newId } from '../../server/lib/ids';
import { runSeed } from '../../server/services/seedService';
import { staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import { createLogin, sessionCookie, teamCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;

/**
 * The single source of truth for who may call what. A route registered in
 * server/http/app.ts but missing here fails the first test, so a new route can
 * never ship without a deliberate decision about its role. The roles are anonymous, a barber
 * signed in with a PIN (team), the owner, and an owner still on a temporary password. A trailing
 * "+" marks the routes still reachable while a temporary password is in use.
 */
const EXPECTED: Record<string, AuthLevel | 'owner+'> = {
  'GET /api/health': 'public',
  'GET /api/shop': 'public',
  'GET /api/sitemap.xml': 'public',
  'GET /api/setup': 'public',
  'GET /api/media/:id': 'public',
  'PUT /api/media/:id': 'public',
  'POST /api/auth/demo-login': 'public',
  'POST /api/admin/demo/reset': 'owner',
  'POST /api/internal/demo/clear': 'internal',
  'GET /api/internal/cron/daily': 'internal',
  'POST /api/internal/cron/daily': 'internal',
  'GET /api/internal/doctor': 'internal',
  'POST /api/internal/bootstrap': 'internal',
  'GET /api/services': 'public',
  'GET /api/staff': 'public',
  'GET /api/staff/:slug': 'public',
  'GET /api/staff/:slug/openings': 'public',
  'GET /api/gallery': 'public',
  'GET /api/availability/next': 'public',
  'GET /api/availability': 'public',
  'GET /api/availability/days': 'public',
  'POST /api/bookings': 'public',
  'GET /api/bookings/manage': 'public',
  'POST /api/bookings/manage/cancel': 'public',
  'POST /api/bookings/manage/reschedule': 'public',
  'POST /api/auth/login': 'public',
  'POST /api/auth/logout': 'owner+',
  'POST /api/auth/logout-all': 'owner+',
  'GET /api/auth/me': 'owner+',
  'POST /api/me/password': 'owner+',
  'POST /api/me/email': 'owner',
  'POST /api/team/login': 'public',
  'GET /api/team/setup/:token': 'public',
  'POST /api/team/setup/:token': 'public',
  'POST /api/team/logout': 'team',
  'GET /api/team/me': 'team',
  'POST /api/kiosk/pair': 'public',
  'POST /api/kiosk/pair-demo': 'public',
  'GET /api/kiosk/board': 'kiosk',
  'GET /api/kiosk/lookup': 'kiosk',
  'POST /api/kiosk/bookings/:id/arrived': 'kiosk',
  'POST /api/kiosk/now': 'kiosk',
  'POST /api/kiosk/exit': 'kiosk',
  'POST /api/kiosk/unpair': 'kiosk',
  'GET /api/admin/kiosk/devices': 'owner',
  'POST /api/admin/kiosk/devices': 'owner',
  'DELETE /api/admin/kiosk/devices/:id': 'owner',
  'POST /api/team/pin': 'team',
  'GET /api/team/today': 'team',
  'GET /api/team/week': 'team',
  'POST /api/team/bookings/:id/status': 'team',
  'POST /api/team/bookings/:id/note': 'team',
  'POST /api/team/walk-ins': 'team',
  'GET /api/team/time-off': 'team',
  'POST /api/team/time-blocks': 'team',
  'DELETE /api/team/time-blocks/:id': 'team',
  'POST /api/team/out-today': 'team',
  'POST /api/team/days-off': 'team',
  'GET /api/admin/staff/:id/access': 'owner',
  'POST /api/admin/staff/:id/setup-link': 'owner',
  'POST /api/admin/staff/:id/unlock': 'owner',
  'GET /api/admin/today': 'owner',
  'GET /api/admin/schedule': 'owner',
  'GET /api/admin/whos-in': 'owner',
  'GET /api/admin/search': 'owner',
  'GET /api/admin/overview': 'owner',
  'GET /api/admin/floor': 'owner',
  'GET /api/admin/line': 'owner',
  'POST /api/admin/line': 'owner',
  'PATCH /api/admin/line/:id': 'owner',
  'POST /api/admin/line/:id/move': 'owner',
  'POST /api/admin/line/:id/seat': 'owner',
  'POST /api/admin/line/:id/left': 'owner',
  'GET /api/team/line': 'team',
  'POST /api/team/line': 'team',
  'POST /api/team/line/:id/seat': 'team',
  'POST /api/team/now': 'team',
  'POST /api/team/bookings/:id/arrived': 'team',
  'POST /api/team/bookings/:id/start': 'team',
  'POST /api/team/bookings': 'team',
  'POST /api/admin/now': 'owner',
  'POST /api/auth/tablet': 'owner',
  'GET /api/admin/checkin/lookup': 'owner',
  'POST /api/admin/checkin/:id/arrived': 'owner',
  'GET /api/team/checkin/lookup': 'team',
  'POST /api/team/checkin/:id/arrived': 'team',
  'GET /api/admin/schedule/week': 'owner',
  'GET /api/admin/customer-list': 'owner',
  'PUT /api/admin/customers/notes': 'owner',
  'POST /api/admin/alerts/:id/resolve': 'owner',
  'POST /api/admin/alerts/:id/dismiss': 'owner',
  'GET /api/admin/booking-table': 'owner',
  'POST /api/admin/bookings/:id/resend': 'owner',
  'GET /api/admin/bookings': 'owner',
  'POST /api/admin/bookings': 'owner',
  'GET /api/admin/bookings/:id': 'owner',
  'PATCH /api/admin/bookings/:id': 'owner',
  'POST /api/admin/bookings/:id/status': 'owner',
  'POST /api/admin/bookings/:id/arrived': 'owner',
  'POST /api/admin/bookings/:id/start': 'owner',
  'POST /api/admin/bookings/:id/cancel': 'owner',
  'POST /api/admin/bookings/:id/reschedule': 'owner',
  'GET /api/admin/customers': 'owner',
  'GET /api/admin/time-blocks': 'owner',
  'POST /api/admin/time-blocks': 'owner',
  'DELETE /api/admin/time-blocks/:id': 'owner',
  'POST /api/admin/staff/:id/day': 'owner',
  'GET /api/admin/services': 'owner',
  'POST /api/admin/services': 'owner',
  'PATCH /api/admin/services/:id': 'owner',
  'DELETE /api/admin/services/:id': 'owner',
  'GET /api/admin/staff': 'owner',
  'POST /api/admin/staff': 'owner',
  'PATCH /api/admin/staff/:id': 'owner',
  'POST /api/admin/staff/:id/slug': 'owner',
  'DELETE /api/admin/staff/:id': 'owner',
  'PUT /api/admin/staff/:id/hours': 'owner',
  'GET /api/admin/hours': 'owner',
  'PUT /api/admin/hours': 'owner',
  'GET /api/admin/closures': 'owner',
  'PUT /api/admin/closures': 'owner',
  'DELETE /api/admin/closures/:id': 'owner',
  'GET /api/admin/settings': 'owner',
  'PUT /api/admin/settings': 'owner',
  'PUT /api/admin/reviews': 'owner',
  'GET /api/admin/audit': 'owner',
  'GET /api/admin/outbox': 'owner',
  'POST /api/admin/outbox/:id/retry': 'owner',
  'GET /api/internal/outbox/deliver': 'internal',
  'POST /api/internal/outbox/deliver': 'internal',
  'GET /api/admin/photos': 'owner',
  'POST /api/admin/photos/upload-url': 'owner',
  'POST /api/admin/photos/confirm': 'owner',
  'PATCH /api/admin/photos/:id': 'owner',
  'DELETE /api/admin/photos/:id': 'owner',
};

type Role = 'anonymous' | 'team' | 'owner' | 'tempPassword';
const ROLES: Role[] = ['anonymous', 'team', 'owner', 'tempPassword'];
let ids: { owner: string; temp: string };

function pathFor(path: string): string {
  return path
    .replace(/:id\b/g, newId())
    .replace(/:slug\b/g, 'nobody')
    .replace(/:token\b/g, 'A'.repeat(43));
}

async function cookieFor(role: Role): Promise<Record<string, string>> {
  if (role === 'anonymous') return {};
  if (role === 'team') return { cookie: await teamCookie(staffSeedId('lee')) };
  return { cookie: await sessionCookie(role === 'owner' ? ids.owner : ids.temp) };
}

beforeAll(async () => {
  await runSeed(db(), NOW);
  const owner = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  const temp = await createLogin({
    role: 'owner',
    staffId: staffSeedId('drew'),
    mustChangePassword: true,
  });
  ids = { owner: owner._id, temp: temp._id };
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

describe('authorization matrix', () => {
  it('lists every registered route exactly once with the declared level', () => {
    const registered = allRoutes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(registered).size).toBe(registered.length);
    expect([...registered].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const route of allRoutes) {
      const expected = EXPECTED[`${route.method} ${route.path}`];
      expect(route.auth, `${route.method} ${route.path}`).toBe(expected?.replace('+', ''));
      expect(route.allowDuringPasswordChange === true, `${route.method} ${route.path}`).toBe(
        expected?.endsWith('+') ?? false,
      );
    }
  });

  it(`answers every route (${Object.keys(EXPECTED).length}) for every role (${ROLES.length}) as declared`, async () => {
    const failures: string[] = [];
    let checked = 0;
    for (const route of allRoutes) {
      const level = EXPECTED[`${route.method} ${route.path}`] ?? 'missing';
      for (const role of ROLES) {
        const res = await call(server.baseUrl, route.method, pathFor(route.path), {
          headers: await cookieFor(role),
          ...(route.method === 'GET' ? {} : { body: {} }),
        });
        checked += 1;
        const parsed = apiErrorSchema.safeParse(res.body);
        const code = parsed.success ? parsed.data.error.code : null;
        const ownerOnly =
          code === 'FORBIDDEN' &&
          parsed.success &&
          parsed.data.error.message === 'Owner access is required';
        const label = `${role} ${route.method} ${route.path} -> ${res.status} ${code ?? ''}`;
        const signedIn = role !== 'anonymous';
        let ok: boolean;
        // Showcase-only routes do not exist while DEMO_MODE is off: a plain 404 for every role.
        if (route.demoOnly === true) ok = res.status === 404 && code === 'NOT_FOUND';
        else if (level === 'internal') ok = res.status === 403;
        else if (level === 'public')
          ok = code !== 'AUTH_REQUIRED' && code !== 'PASSWORD_CHANGE_REQUIRED' && !ownerOnly;
        else if (!signedIn) ok = res.status === 401 && code === 'AUTH_REQUIRED';
        // A kiosk route takes only the paired tablet's cookie: no sign-in opens it.
        else if (level === 'kiosk') ok = res.status === 401 && code === 'AUTH_REQUIRED';
        // The two kinds of sign-in never stand in for each other: a barber's PIN session opens no
        // owner route, and the owner's login opens no barber route.
        else if (level === 'team')
          ok =
            role === 'team'
              ? code !== 'AUTH_REQUIRED' && code !== 'PASSWORD_CHANGE_REQUIRED'
              : res.status === 401 && code === 'AUTH_REQUIRED';
        else if (role === 'team') ok = res.status === 401 && code === 'AUTH_REQUIRED';
        else if (role === 'tempPassword' && level !== 'owner+')
          ok = res.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED';
        else ok = code !== 'AUTH_REQUIRED' && code !== 'PASSWORD_CHANGE_REQUIRED' && !ownerOnly;
        if (!ok) failures.push(label);
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBe(Object.keys(EXPECTED).length * ROLES.length);
  });

  it('answers the showcase-only routes as declared once DEMO_MODE is on', async () => {
    const { resetEnvCache } = await import('../../server/env');
    process.env.DEMO_MODE = 'true';
    resetEnvCache();
    try {
      const demoRoutes = allRoutes.filter((r) => r.demoOnly === true);
      expect(demoRoutes.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
        'POST /api/admin/demo/reset',
        'POST /api/auth/demo-login',
        'POST /api/kiosk/pair-demo',
      ]);
      const failures: string[] = [];
      // The owner goes last: a reset deletes the other logins.
      const order: Role[] = ['anonymous', 'tempPassword', 'team', 'owner'];
      for (const route of demoRoutes) {
        for (const role of order) {
          const res = await call(server.baseUrl, route.method, route.path, {
            headers: await cookieFor(role),
            body: {},
          });
          const parsed = apiErrorSchema.safeParse(res.body);
          const code = parsed.success ? parsed.data.error.code : null;
          const label = `${role} ${route.method} ${route.path} -> ${res.status} ${code ?? ''}`;
          let ok: boolean;
          if (route.auth === 'public') ok = res.status === 200;
          else if (role === 'anonymous') ok = res.status === 401 && code === 'AUTH_REQUIRED';
          else if (role === 'tempPassword')
            ok = res.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED';
          else if (role === 'team') ok = res.status === 401 && code === 'AUTH_REQUIRED';
          else ok = res.status === 200;
          if (!ok) failures.push(label);
        }
      }
      expect(failures).toEqual([]);
    } finally {
      process.env.DEMO_MODE = 'false';
      resetEnvCache();
    }
  });

  it('a route registered without a valid auth level stops the router from starting', async () => {
    const { createRouter, denyAllAuthenticator } = await import('../../server/http/router');
    expect(() =>
      createRouter(
        [
          {
            method: 'GET',
            path: '/api/test/undeclared',
            auth: undefined as unknown as AuthLevel,
            handler: () => Promise.resolve({ body: { leaked: true } }),
          },
        ],
        denyAllAuthenticator,
      ),
    ).toThrow(/no valid auth level/);
  });
});
