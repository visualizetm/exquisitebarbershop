import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allRoutes } from '../../server/http/app';
import type { AuthLevel } from '../../server/http/types';
import { newId } from '../../server/lib/ids';
import { runSeed } from '../../server/services/seedService';
import { staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import { createLogin, sessionCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;

/**
 * The single source of truth for who may call what. A route registered in
 * server/http/app.ts but missing here fails the first test, so a new route can
 * never ship without a deliberate decision about its role. A trailing "+" marks
 * the routes still reachable while a temporary password is in use.
 */
const EXPECTED: Record<string, AuthLevel | 'barber+'> = {
  'GET /api/health': 'public',
  'GET /api/shop': 'public',
  'GET /api/sitemap.xml': 'public',
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
  'POST /api/auth/logout': 'barber+',
  'POST /api/auth/logout-all': 'barber+',
  'GET /api/auth/me': 'barber+',
  'POST /api/me/password': 'barber+',
  'GET /api/me/schedule': 'barber',
  'GET /api/me/bookings/:id': 'barber',
  'POST /api/me/bookings/:id/status': 'barber',
  'POST /api/me/time-blocks': 'barber',
  'DELETE /api/me/time-blocks/:id': 'barber',
  'GET /api/admin/today': 'owner',
  'GET /api/admin/schedule': 'owner',
  'GET /api/admin/whos-in': 'owner',
  'GET /api/admin/bookings': 'owner',
  'POST /api/admin/bookings': 'owner',
  'GET /api/admin/bookings/:id': 'owner',
  'PATCH /api/admin/bookings/:id': 'owner',
  'POST /api/admin/bookings/:id/status': 'owner',
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
  'GET /api/admin/users': 'owner',
  'POST /api/admin/users': 'owner',
  'POST /api/admin/users/:id/reset-password': 'owner',
  'POST /api/admin/users/:id/disable': 'owner',
  'POST /api/admin/users/:id/enable': 'owner',
  'GET /api/admin/audit': 'owner',
  'GET /api/admin/outbox': 'owner',
  'POST /api/admin/outbox/:id/retry': 'owner',
  'GET /api/internal/outbox/deliver': 'internal',
  'POST /api/internal/outbox/deliver': 'internal',
  'GET /api/admin/photos': 'barber',
  'POST /api/admin/photos/upload-url': 'barber',
  'POST /api/admin/photos/confirm': 'barber',
  'PATCH /api/admin/photos/:id': 'barber',
  'DELETE /api/admin/photos/:id': 'barber',
};

type Role = 'anonymous' | 'barber' | 'owner' | 'tempPassword';
const ROLES: Role[] = ['anonymous', 'barber', 'owner', 'tempPassword'];
let ids: { barber: string; owner: string; temp: string };

function pathFor(path: string): string {
  return path.replace(/:id\b/g, newId()).replace(/:slug\b/g, 'nobody');
}

async function cookieFor(role: Role): Promise<Record<string, string>> {
  if (role === 'anonymous') return {};
  const userId = role === 'barber' ? ids.barber : role === 'owner' ? ids.owner : ids.temp;
  return { cookie: await sessionCookie(userId) };
}

beforeAll(async () => {
  await runSeed(db(), NOW);
  const barber = await createLogin({ role: 'barber', staffId: staffSeedId('marcus') });
  const owner = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  const temp = await createLogin({
    role: 'barber',
    staffId: staffSeedId('dee'),
    mustChangePassword: true,
  });
  ids = { barber: barber._id, owner: owner._id, temp: temp._id };
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
        if (level === 'internal') ok = res.status === 403;
        else if (level === 'public')
          ok = code !== 'AUTH_REQUIRED' && code !== 'PASSWORD_CHANGE_REQUIRED' && !ownerOnly;
        else if (!signedIn) ok = res.status === 401 && code === 'AUTH_REQUIRED';
        else if (role === 'tempPassword' && level !== 'barber+')
          ok = res.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED';
        else if (level === 'owner' && role === 'barber') ok = res.status === 403 && ownerOnly;
        else ok = code !== 'AUTH_REQUIRED' && code !== 'PASSWORD_CHANGE_REQUIRED' && !ownerOnly;
        if (!ok) failures.push(label);
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBe(Object.keys(EXPECTED).length * ROLES.length);
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
