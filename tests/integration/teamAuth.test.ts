import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PIN_IP_LIMIT,
  PIN_LOCKOUT,
  issueSetupLink,
  pinThrottleKey,
} from '../../server/auth/teamAuth';
import { loginThrottleRepo, staffPinsRepo, staffRepo } from '../../server/repos';
import { sha256Hex } from '../../server/lib/ids';
import { runSeed } from '../../server/services/seedService';
import { staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import {
  setupLinkResponseSchema,
  staffAccessResponseSchema,
  teamMeResponseSchema,
} from '../../shared/api/team';
import { createLogin, sessionCookie, setPin, teamCookieFrom, TEST_PIN } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
const lee = staffSeedId('lee');
const drew = staffSeedId('drew');
const nelly = staffSeedId('nelly');
const iniya = staffSeedId('iniya');

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
  for (const name of ['rateLimits', 'loginThrottle', 'teamSessions', 'setupTokens', 'staffPins']) {
    await db().collection(name).deleteMany({});
  }
  await db()
    .collection('staff')
    .updateMany({}, { $set: { showOnWebsite: true, deletedAt: null } });
});

const owner = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie: ownerCookie },
    ...(body === undefined ? {} : { body }),
  });
const signIn = (staffId: string, pin: string, ip?: string) =>
  call(server.baseUrl, 'POST', '/api/team/login', {
    body: { staffId, pin },
    ...(ip ? { headers: { 'x-forwarded-for': ip } } : {}),
  });
const withoutRequestId = (body: Record<string, unknown>) => {
  const error = (body as { error: Record<string, unknown> }).error;
  return { code: error.code, message: error.message };
};

async function newLink(staffId: string): Promise<string> {
  const res = await owner('POST', `/api/admin/staff/${staffId}/setup-link`);
  expect(res.status).toBe(201);
  return setupLinkResponseSchema.parse(res.body).url;
}
const tokenOf = (url: string) => url.split('/').at(-1) ?? '';

describe('setup links', () => {
  it('make a 32 byte token, store only its hash, work once and set an argon2id PIN', async () => {
    const url = await newLink(lee);
    expect(url).toMatch(/\/team\/setup\/[A-Za-z0-9_-]{43}$/);
    const token = tokenOf(url);
    // 32 random bytes in base64url is 43 characters.
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    const stored = await db().collection('setupTokens').findOne({ staffId: lee });
    expect(stored?.tokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    const life = (doc: { expiresAt: Date; createdAt: Date } | null | undefined) =>
      doc ? doc.expiresAt.getTime() - doc.createdAt.getTime() : null;
    expect(life(stored as { expiresAt: Date; createdAt: Date } | null)).toBe(72 * 3600_000);

    const info = await call(server.baseUrl, 'GET', `/api/team/setup/${token}`);
    expect(info.body).toEqual({ staffName: 'Lee' });

    // A PIN that is too easy, and two that do not match, leave the link usable.
    for (const body of [
      { pin: '123456', confirmPin: '123456' },
      { pin: '482915', confirmPin: '482916' },
    ]) {
      const bad = await call(server.baseUrl, 'POST', `/api/team/setup/${token}`, { body });
      expect(bad.status).toBe(400);
    }
    const ok = await call(server.baseUrl, 'POST', `/api/team/setup/${token}`, {
      body: { pin: TEST_PIN, confirmPin: TEST_PIN },
    });
    expect(ok.status).toBe(200);
    const setCookie = ok.headers.getSetCookie()[0] ?? '';
    expect(setCookie).toMatch(
      /^__Host-exq_team=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200$/,
    );
    const pin = await staffPinsRepo.findPinByStaff(lee);
    expect(pin?.pinHash).toMatch(/^\$argon2id\$/);
    expect(pin?.pinHash).not.toContain(TEST_PIN);

    // The link is spent.
    const again = await call(server.baseUrl, 'POST', `/api/team/setup/${token}`, {
      body: { pin: '290417', confirmPin: '290417' },
    });
    expect(again.status).toBe(404);
    expect((await call(server.baseUrl, 'GET', `/api/team/setup/${token}`)).status).toBe(404);
    // The PIN they chose is the one that works.
    expect((await signIn(lee, TEST_PIN)).status).toBe(200);
  });

  it('expire after 72 hours, and a made-up token looks the same as an expired one', async () => {
    const issued = await issueSetupLink(
      { type: 'owner', userId: null, staffId: null },
      'u'.repeat(24).replace(/u/g, 'a'),
      lee,
      { ip: '1.1.1.1', userAgent: null, requestId: 'r', now: new Date(Date.now() - 73 * 3600_000) },
    );
    const expired = await call(server.baseUrl, 'POST', `/api/team/setup/${issued.token}`, {
      body: { pin: TEST_PIN, confirmPin: TEST_PIN },
    });
    const madeUp = await call(server.baseUrl, 'POST', `/api/team/setup/${'B'.repeat(43)}`, {
      body: { pin: TEST_PIN, confirmPin: TEST_PIN },
    });
    expect(expired.status).toBe(404);
    expect(withoutRequestId(expired.body)).toEqual(withoutRequestId(madeUp.body));
    expect(await staffPinsRepo.findPinByStaff(lee)).toBeNull();
  });

  it('a new link retires the old link, the old PIN and every session of that barber', async () => {
    await setPin(lee);
    const first = await signIn(lee, TEST_PIN);
    const cookie = teamCookieFrom(first.headers) ?? '';
    expect(
      (await call(server.baseUrl, 'GET', '/api/team/me', { headers: { cookie } })).status,
    ).toBe(200);
    const oldLink = await newLink(lee);
    const newer = await newLink(lee);
    expect(oldLink).not.toBe(newer);
    // Signed out everywhere, and the old PIN no longer opens anything.
    expect(
      (await call(server.baseUrl, 'GET', '/api/team/me', { headers: { cookie } })).status,
    ).toBe(401);
    expect((await signIn(lee, TEST_PIN)).status).toBe(401);
    // Only the newest link works.
    expect(
      (
        await call(server.baseUrl, 'POST', `/api/team/setup/${tokenOf(oldLink)}`, {
          body: { pin: '290417', confirmPin: '290417' },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(server.baseUrl, 'POST', `/api/team/setup/${tokenOf(newer)}`, {
          body: { pin: '290417', confirmPin: '290417' },
        })
      ).status,
    ).toBe(200);
    // Another barber is untouched.
    await setPin(drew);
    await newLink(lee);
    expect((await signIn(drew, TEST_PIN)).status).toBe(200);
  });

  it('are the owner’s to make: a barber session cannot', async () => {
    await setPin(lee);
    const cookie = teamCookieFrom((await signIn(lee, TEST_PIN)).headers) ?? '';
    const res = await call(server.baseUrl, 'POST', `/api/admin/staff/${drew}/setup-link`, {
      headers: { cookie },
    });
    expect(res.status).toBe(401);
  });
});

describe('signing in', () => {
  it('opens a 12 hour session in its own cookie, with only the hash stored', async () => {
    await setPin(lee);
    const res = await signIn(lee, TEST_PIN);
    expect(res.status).toBe(200);
    const cookie = teamCookieFrom(res.headers) ?? '';
    expect(cookie).toMatch(/^__Host-exq_team=/);
    const token = cookie.split('=')[1] ?? '';
    const session = await db().collection('teamSessions').findOne({ staffId: lee });
    expect(session?.tokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(session)).not.toContain(token);
    expect(
      session
        ? (session.expiresAt as Date).getTime() - (session.createdAt as Date).getTime()
        : null,
    ).toBe(12 * 3600_000);
    const me = teamMeResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/team/me', { headers: { cookie } })).body,
    );
    expect(me.staff).toMatchObject({ id: lee, name: 'Lee' });
    expect((await staffPinsRepo.findPinByStaff(lee))?.lastSignInAt).not.toBeNull();
  });

  it('a session past its 12 hours is refused, however recently it was used', async () => {
    await setPin(lee);
    const cookie = teamCookieFrom((await signIn(lee, TEST_PIN)).headers) ?? '';
    await db()
      .collection('teamSessions')
      .updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(
      (await call(server.baseUrl, 'GET', '/api/team/me', { headers: { cookie } })).status,
    ).toBe(401);
  });

  it('answers a wrong PIN, an unset PIN, a hidden barber and an unknown barber identically', async () => {
    await setPin(lee);
    await setPin(drew);
    await staffRepo.updateStaff(drew, { showOnWebsite: false }, new Date());
    const answers = [
      await signIn(lee, '999111'),
      await signIn(nelly, TEST_PIN), // no PIN yet
      await signIn(drew, TEST_PIN), // hidden from the site
      await signIn('f'.repeat(24), TEST_PIN), // not a barber at all
    ];
    for (const a of answers) {
      expect(a.status).toBe(401);
      expect(a.headers.getSetCookie()).toEqual([]);
    }
    const first = withoutRequestId(answers[0]?.body ?? {});
    expect(first).toEqual({ code: 'INVALID_CREDENTIALS', message: 'That PIN did not work' });
    for (const a of answers) expect(withoutRequestId(a.body)).toEqual(first);
  });

  it('a barber who is removed loses their sessions and cannot sign in', async () => {
    await setPin(iniya);
    const cookie = teamCookieFrom((await signIn(iniya, TEST_PIN)).headers) ?? '';
    await staffRepo.softDeleteStaff(iniya, new Date());
    expect(
      (await call(server.baseUrl, 'GET', '/api/team/today', { headers: { cookie } })).status,
    ).toBe(401);
    expect((await signIn(iniya, TEST_PIN)).status).toBe(401);
  });

  it('logging out ends the session and clears the cookie', async () => {
    await setPin(lee);
    const cookie = teamCookieFrom((await signIn(lee, TEST_PIN)).headers) ?? '';
    const out = await call(server.baseUrl, 'POST', '/api/team/logout', { headers: { cookie } });
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie()[0]).toMatch(/^__Host-exq_team=; .*Max-Age=0$/);
    expect(
      (await call(server.baseUrl, 'GET', '/api/team/me', { headers: { cookie } })).status,
    ).toBe(401);
  });
});

describe('lockout and limits', () => {
  it('five wrong tries lock that barber for 15 minutes, even for the right PIN, and no one else', async () => {
    await setPin(lee);
    await setPin(drew);
    for (let i = 0; i < PIN_LOCKOUT.threshold; i += 1) {
      expect((await signIn(lee, `99911${String(i)}`)).status).toBe(401);
    }
    const locked = await signIn(lee, TEST_PIN);
    expect(locked.status).toBe(423);
    expect(apiErrorSchema.parse(locked.body).error.code).toBe('ACCOUNT_LOCKED');
    const wait = Number(locked.headers.get('retry-after'));
    expect(wait).toBeGreaterThan(14 * 60);
    expect(wait).toBeLessThanOrEqual(15 * 60);
    expect((await signIn(drew, TEST_PIN)).status).toBe(200);
    // The owner sees the lock and can lift it.
    const access = staffAccessResponseSchema.parse(
      (await owner('GET', `/api/admin/staff/${lee}/access`)).body,
    );
    expect(access.lockedUntil).not.toBeNull();
    expect((await owner('POST', `/api/admin/staff/${lee}/unlock`)).status).toBe(200);
    expect((await signIn(lee, TEST_PIN)).status).toBe(200);
  });

  it('the lock lifts by itself after 15 minutes', async () => {
    await setPin(lee);
    for (let i = 0; i < 5; i += 1) await signIn(lee, `99911${String(i)}`);
    expect((await signIn(lee, TEST_PIN)).status).toBe(423);
    await db()
      .collection<{ _id: string; lockedUntil: Date }>('loginThrottle')
      .updateOne(
        { _id: pinThrottleKey(lee) },
        { $set: { lockedUntil: new Date(Date.now() - 1000) } },
      );
    expect((await signIn(lee, TEST_PIN)).status).toBe(200);
  });

  it('only failures count: successes in between keep the barber unlocked', async () => {
    await setPin(lee);
    for (let round = 0; round < 3; round += 1) {
      for (let i = 0; i < 4; i += 1) expect((await signIn(lee, '999111')).status).toBe(401);
      expect((await signIn(lee, TEST_PIN)).status).toBe(200);
    }
    expect(await loginThrottleRepo.getLoginThrottle(pinThrottleKey(lee))).toBeNull();
  });

  it('thirty wrong tries from one address stop that address, and successes never count', async () => {
    await setPin(lee);
    const ip = '198.51.100.20';
    // Spread over many ids so no single barber locks first: unknown ids only cost the address.
    for (let i = 0; i < PIN_IP_LIMIT.limit; i += 1) {
      const fake = (i + 1).toString(16).padStart(24, '0');
      expect((await signIn(fake, '999111', ip)).status).toBe(401);
    }
    const stopped = await signIn(lee, TEST_PIN, ip);
    expect(stopped.status).toBe(429);
    expect(apiErrorSchema.parse(stopped.body).error.code).toBe('RATE_LIMITED');
    expect(Number(stopped.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another address is unaffected.
    expect((await signIn(lee, TEST_PIN, '198.51.100.21')).status).toBe(200);
    // Thirty-five good sign-ins from a third address never trip the limit.
    for (let i = 0; i < 35; i += 1) {
      expect((await signIn(lee, TEST_PIN, '198.51.100.22')).status).toBe(200);
    }
  });
});

describe('changing a PIN', () => {
  it('needs the current PIN, refuses weak ones and ends the other sessions', async () => {
    await setPin(lee);
    const phone = teamCookieFrom((await signIn(lee, TEST_PIN)).headers) ?? '';
    const tablet = teamCookieFrom((await signIn(lee, TEST_PIN)).headers) ?? '';
    const change = (body: unknown) =>
      call(server.baseUrl, 'POST', '/api/team/pin', { headers: { cookie: phone }, body });
    expect(
      (await change({ currentPin: '999111', newPin: '290417', confirmPin: '290417' })).status,
    ).toBe(401);
    expect(
      (await change({ currentPin: TEST_PIN, newPin: '123456', confirmPin: '123456' })).status,
    ).toBe(400);
    expect(
      (await change({ currentPin: TEST_PIN, newPin: '290417', confirmPin: '290418' })).status,
    ).toBe(400);
    expect(
      (await change({ currentPin: TEST_PIN, newPin: TEST_PIN, confirmPin: TEST_PIN })).status,
    ).toBe(400);
    expect(
      (await change({ currentPin: TEST_PIN, newPin: '290417', confirmPin: '290417' })).status,
    ).toBe(200);
    expect(
      (await call(server.baseUrl, 'GET', '/api/team/me', { headers: { cookie: phone } })).status,
    ).toBe(200);
    expect(
      (await call(server.baseUrl, 'GET', '/api/team/me', { headers: { cookie: tablet } })).status,
    ).toBe(401);
    expect((await signIn(lee, TEST_PIN)).status).toBe(401);
    expect((await signIn(lee, '290417')).status).toBe(200);
  });
});

describe('what the owner sees', () => {
  it('reports whether a PIN exists, the last sign-in and a pending link, and nothing secret', async () => {
    const empty = staffAccessResponseSchema.parse(
      (await owner('GET', `/api/admin/staff/${lee}/access`)).body,
    );
    expect(empty).toEqual({
      hasPin: false,
      lastSignInAt: null,
      lockedUntil: null,
      setupLinkActive: false,
    });
    await newLink(lee);
    expect(
      staffAccessResponseSchema.parse((await owner('GET', `/api/admin/staff/${lee}/access`)).body)
        .setupLinkActive,
    ).toBe(true);
    await setPin(lee);
    await signIn(lee, TEST_PIN);
    const text = JSON.stringify((await owner('GET', `/api/admin/staff/${lee}/access`)).body);
    expect(text).not.toMatch(/argon2|pinHash|tokenHash/);
    const after = staffAccessResponseSchema.parse(JSON.parse(text));
    expect(after.hasPin).toBe(true);
    expect(after.lastSignInAt).not.toBeNull();
    expect((await owner('GET', `/api/admin/staff/${'e'.repeat(24)}/access`)).status).toBe(404);
  });

  it('writes sign-ins, failures, links and unlocks to the audit log, never a PIN', async () => {
    await setPin(lee);
    await signIn(lee, '999111');
    await signIn(lee, TEST_PIN);
    await newLink(lee);
    await owner('POST', `/api/admin/staff/${lee}/unlock`);
    const entries = await db().collection('auditLog').find({ entityId: lee }).toArray();
    const actions = entries.map((e) => e.action as string);
    expect(actions).toEqual(
      expect.arrayContaining([
        'auth.pin.failure',
        'auth.pin.success',
        'auth.pin.setupLink',
        'auth.pin.unlock',
      ]),
    );
    const raw = JSON.stringify(entries);
    expect(raw).not.toContain(TEST_PIN);
    expect(raw).not.toContain('999111');
  });
});

describe('the demo hint', () => {
  it('the public shop says it is a demo only when DEMO_MODE is on', async () => {
    const off = await call(server.baseUrl, 'GET', '/api/shop');
    expect(off.body.demo).toBeFalsy();
  });
});
