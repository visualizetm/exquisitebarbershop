import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { emailKey, operatorResetPassword } from '../../server/auth/authService';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '../../server/auth/sessions';
import { loginThrottleRepo, sessionsRepo, usersRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { staffSeedId } from '../../seed/shop';
import { meResponseSchema } from '../../shared/api/auth';
import { apiErrorSchema } from '../../shared/api/errors';
import {
  BARBER_PASSWORD,
  cookieFrom,
  createLogin,
  OWNER_PASSWORD,
  sessionCookie,
  tokenHashOf,
} from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  await db().collection('rateLimits').deleteMany({});
  await db().collection('loginThrottle').deleteMany({});
});

function login(
  email: string,
  password: string,
  ip = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
) {
  return call(server.baseUrl, 'POST', '/api/auth/login', {
    body: { email, password },
    headers: { 'x-forwarded-for': ip },
  });
}

function withoutRequestId(body: Record<string, unknown>) {
  const error = { ...(body.error as Record<string, unknown>) };
  delete error.requestId;
  return error;
}

describe('login', () => {
  it('signs in, sets a hardened session cookie, and answers /me', async () => {
    const owner = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
    const res = await login(owner.email.toUpperCase(), OWNER_PASSWORD);
    expect(res.status).toBe(200);
    const me = meResponseSchema.parse(res.body);
    expect(me.user.role).toBe('owner');
    expect(me.staff?.slug).toBe('dontrise');
    const setCookie = res.headers.getSetCookie()[0] ?? '';
    expect(setCookie).toMatch(
      /^__Host-exq_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600$/,
    );
    const cookie = cookieFrom(res.headers) ?? '';
    const stored = await db()
      .collection('sessions')
      .findOne({ tokenHash: tokenHashOf(cookie) });
    expect(stored).not.toBeNull();
    expect(JSON.stringify(stored)).not.toContain(cookie.split('=')[1]);
    expect(
      (await call(server.baseUrl, 'GET', '/api/auth/me', { headers: { cookie } })).status,
    ).toBe(200);
  });

  it('a wrong password and an unknown email look the same: status, body and time', async () => {
    const barber = await createLogin({ role: 'barber', staffId: staffSeedId('marcus') });
    const wrong = await login(barber.email, 'definitely-not-it-123');
    const unknown = await login('nobody-here@example.com', 'definitely-not-it-123');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(withoutRequestId(wrong.body)).toEqual(withoutRequestId(unknown.body));
    expect(withoutRequestId(wrong.body)).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect',
    });
    expect(wrong.headers.getSetCookie()).toEqual([]);

    // Both paths run argon2: timings stay within a factor of two of each other.
    const time = async (email: string) => {
      const started = performance.now();
      await login(email, 'definitely-not-it-123');
      return performance.now() - started;
    };
    const samples = { known: [] as number[], unknown: [] as number[] };
    for (let i = 0; i < 5; i += 1) {
      samples.known.push(await time(barber.email));
      samples.unknown.push(await time(`ghost${i}@example.com`));
    }
    // Medians resist a slow outlier when other test files load the machine. Skipping
    // the hash would make an unknown email about 20 times faster, far outside these bounds.
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    const ratio = median(samples.unknown) / median(samples.known);
    expect(ratio).toBeGreaterThan(0.33);
    expect(ratio).toBeLessThan(3);
  });

  it('disabled logins and barbers whose chair was removed get the same generic answer', async () => {
    const disabled = await createLogin({ role: 'barber', staffId: staffSeedId('tre') });
    await usersRepo.setUserActive(disabled._id, false, new Date());
    const res = await login(disabled.email, BARBER_PASSWORD);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('INVALID_CREDENTIALS');
    const unlinked = await createLogin({ role: 'barber', staffId: null });
    expect(
      apiErrorSchema.parse((await login(unlinked.email, BARBER_PASSWORD)).body).error.code,
    ).toBe('INVALID_CREDENTIALS');
  });

  it('writes every attempt to the audit log, never the password', async () => {
    const owner = await createLogin({ role: 'owner', staffId: null });
    await login(owner.email, 'wrong-password-zzz-1');
    await login(owner.email, OWNER_PASSWORD);
    await login('who@example.com', 'wrong-password-zzz-2');
    const entries = await db()
      .collection<{
        action: string;
        entityId: string;
        meta: { email: string; reason: string | null };
      }>('auditLog')
      .find({ action: /^auth\.login/ })
      .toArray();
    const mine = entries.filter((e) => e.meta.email === owner.email);
    expect(mine.map((e) => [e.action, e.meta.reason])).toEqual(
      expect.arrayContaining([
        ['auth.login.failure', 'badPassword'],
        ['auth.login.success', null],
      ]),
    );
    expect(entries.find((e) => e.meta.email === 'who@example.com')?.meta.reason).toBe(
      'unknownEmail',
    );
    const raw = JSON.stringify(entries);
    expect(raw).not.toContain('wrong-password-zzz');
    expect(raw).not.toContain(OWNER_PASSWORD);
  });

  it('locks an email after five failures, longer each time, identically for unknown emails', async () => {
    const barber = await createLogin({ role: 'barber', staffId: staffSeedId('jay') });
    for (let i = 0; i < 5; i += 1)
      expect((await login(barber.email, `bad-guess-number-${i}`)).status).toBe(401);
    const locked = await login(barber.email, BARBER_PASSWORD);
    expect(locked.status).toBe(423);
    expect(apiErrorSchema.parse(locked.body).error.code).toBe('ACCOUNT_LOCKED');
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(4 * 60);
    expect(Number(locked.headers.get('retry-after'))).toBeLessThanOrEqual(5 * 60);

    // Unknown emails get the same treatment, so lockouts reveal nothing.
    for (let i = 0; i < 5; i += 1) await login('ghost-lock@example.com', `bad-guess-number-${i}`);
    expect((await login('ghost-lock@example.com', 'anything-at-all-1')).status).toBe(423);

    // When the first lock lapses, five more failures lock for longer.
    await db()
      .collection<{ _id: string; lockedUntil: Date }>('loginThrottle')
      .updateOne(
        { _id: emailKey(barber.email) },
        { $set: { lockedUntil: new Date(Date.now() - 1000) } },
      );
    await db().collection('rateLimits').deleteMany({});
    for (let i = 0; i < 5; i += 1) await login(barber.email, `bad-guess-again-${i}`);
    const second = await login(barber.email, BARBER_PASSWORD);
    expect(second.status).toBe(423);
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(14 * 60);

    // A success after the lock clears the history.
    await db()
      .collection<{ _id: string; lockedUntil: Date }>('loginThrottle')
      .updateOne(
        { _id: emailKey(barber.email) },
        { $set: { lockedUntil: new Date(Date.now() - 1000) } },
      );
    expect((await login(barber.email, BARBER_PASSWORD)).status).toBe(200);
    expect(await loginThrottleRepo.getLoginThrottle(emailKey(barber.email))).toBeNull();
  });

  it('rate limits per IP and per account', async () => {
    const ip = '203.0.113.200';
    let last = 0;
    for (let i = 0; i < 21; i += 1)
      last = (await login(`spray${i}@example.com`, 'x-wrong-password-1', ip)).status;
    expect(last).toBe(429);

    const target = 'target@example.com';
    for (let i = 0; i < 10; i += 1) {
      // Clear the lock each time so the per-account rate limit is what trips.
      await db().collection('loginThrottle').deleteMany({});
      await login(target, `x-wrong-password-${i}`, `198.51.100.${i + 10}`);
    }
    await db().collection('loginThrottle').deleteMany({});
    const res = await login(target, 'x-wrong-password-final', '198.51.100.99');
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toMatch(/^\d+$/);
  });

  it('a temporary password must be changed before anything else works', async () => {
    const barber = await createLogin({
      role: 'barber',
      staffId: staffSeedId('kris'),
      mustChangePassword: true,
    });
    const res = await login(barber.email, BARBER_PASSWORD);
    expect(meResponseSchema.parse(res.body).user.mustChangePassword).toBe(true);
    const cookie = cookieFrom(res.headers) ?? '';
    const blocked = await call(server.baseUrl, 'GET', '/api/me/schedule', { headers: { cookie } });
    expect(blocked.status).toBe(403);
    expect(apiErrorSchema.parse(blocked.body).error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const weak = await call(server.baseUrl, 'POST', '/api/me/password', {
      headers: { cookie },
      body: { currentPassword: BARBER_PASSWORD, newPassword: 'short' },
    });
    expect(weak.status).toBe(400);
    const wrongCurrent = await call(server.baseUrl, 'POST', '/api/me/password', {
      headers: { cookie },
      body: { currentPassword: 'not-the-current-1', newPassword: 'a-brand-new-phrase-55' },
    });
    expect(apiErrorSchema.parse(wrongCurrent.body).error.code).toBe('INVALID_CREDENTIALS');
    const same = await call(server.baseUrl, 'POST', '/api/me/password', {
      headers: { cookie },
      body: { currentPassword: BARBER_PASSWORD, newPassword: BARBER_PASSWORD },
    });
    expect(same.status).toBe(400);
    const changed = await call(server.baseUrl, 'POST', '/api/me/password', {
      headers: { cookie },
      body: { currentPassword: BARBER_PASSWORD, newPassword: 'a-brand-new-phrase-55' },
    });
    expect(changed.status).toBe(200);
    expect(meResponseSchema.parse(changed.body).user.mustChangePassword).toBe(false);
    expect(
      (await call(server.baseUrl, 'GET', '/api/me/schedule', { headers: { cookie } })).status,
    ).toBe(200);
    expect((await login(barber.email, 'a-brand-new-phrase-55')).status).toBe(200);
  });

  it('the operator reset clears lockouts, ends sessions and issues a temporary password', async () => {
    const owner = await createLogin({ role: 'owner', staffId: null });
    const cookie = await sessionCookie(owner._id);
    for (let i = 0; i < 5; i += 1) await login(owner.email, `bad-guess-number-${i}`);
    const result = await operatorResetPassword({ email: owner.email, password: null }, new Date());
    expect(result.temporary).toBe(true);
    expect(
      (await call(server.baseUrl, 'GET', '/api/auth/me', { headers: { cookie } })).status,
    ).toBe(401);
    const res = await login(owner.email, result.password);
    expect(res.status).toBe(200);
    expect(meResponseSchema.parse(res.body).user.mustChangePassword).toBe(true);
    await expect(
      operatorResetPassword({ email: owner.email, password: 'weak' }, new Date()),
    ).rejects.toThrow(/too weak/);
    await expect(
      operatorResetPassword({ email: 'missing@example.com', password: null }, new Date()),
    ).rejects.toThrow(/No login/);
    const direct = await operatorResetPassword(
      { email: owner.email, password: 'chosen-by-operator-77' },
      new Date(),
    );
    expect(direct.temporary).toBe(false);
    expect(
      meResponseSchema.parse((await login(owner.email, 'chosen-by-operator-77')).body).user
        .mustChangePassword,
    ).toBe(false);
  });
});

describe('sessions', () => {
  // Owner logins need no chair, so each test can have its own without hitting the one-login-per-chair index.
  async function signedIn() {
    const user = await createLogin({ role: 'owner', staffId: null, password: BARBER_PASSWORD });
    const res = await login(user.email, BARBER_PASSWORD);
    return { user, cookie: cookieFrom(res.headers) ?? '' };
  }
  const me = (cookie: string) =>
    call(server.baseUrl, 'GET', '/api/auth/me', { headers: { cookie } });

  it('every sign-in gets a new token and both stay valid', async () => {
    const { user, cookie } = await signedIn();
    const second = cookieFrom((await login(user.email, BARBER_PASSWORD)).headers) ?? '';
    expect(second).not.toBe(cookie);
    expect((await me(cookie)).status).toBe(200);
    expect((await me(second)).status).toBe(200);
  });

  it('expires after 14 idle days', async () => {
    const { cookie } = await signedIn();
    await db()
      .collection('sessions')
      .updateOne(
        { tokenHash: tokenHashOf(cookie) },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
    const res = await me(cookie);
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()[0]).toMatch(/Max-Age=0/);
  });

  it('slides the expiry forward on use, but never past 60 days from sign-in', async () => {
    const { cookie } = await signedIn();
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
    await db()
      .collection('sessions')
      .updateOne(
        { tokenHash: tokenHashOf(cookie) },
        { $set: { lastSeenAt: twoHoursAgo, expiresAt: new Date(Date.now() + 3600_000) } },
      );
    const res = await me(cookie);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()[0]).toMatch(/Max-Age=(1209600|12095\d\d)$/);
    const renewed = await sessionsRepo.findActiveSession(tokenHashOf(cookie), new Date());
    expect(renewed?.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_IDLE_MS - 60_000);

    const createdAt = new Date(Date.now() - SESSION_ABSOLUTE_MS + 3600_000);
    await db()
      .collection('sessions')
      .updateOne(
        { tokenHash: tokenHashOf(cookie) },
        { $set: { createdAt, lastSeenAt: twoHoursAgo } },
      );
    await me(cookie);
    const capped = await sessionsRepo.findActiveSession(tokenHashOf(cookie), new Date());
    expect(capped?.expiresAt.getTime()).toBe(createdAt.getTime() + SESSION_ABSOLUTE_MS);
  });

  it('ends at the 60 day absolute limit even when recently used', async () => {
    const { cookie } = await signedIn();
    await db()
      .collection('sessions')
      .updateOne(
        { tokenHash: tokenHashOf(cookie) },
        {
          $set: {
            createdAt: new Date(Date.now() - SESSION_ABSOLUTE_MS - 1000),
            expiresAt: new Date(Date.now() + 3600_000),
          },
        },
      );
    expect((await me(cookie)).status).toBe(401);
    const doc = await db()
      .collection<{ revokedAt: Date | null }>('sessions')
      .findOne({ tokenHash: tokenHashOf(cookie) });
    expect(doc?.revokedAt).not.toBeNull();
  });

  it('log out ends one session; log out everywhere ends them all', async () => {
    const { user, cookie } = await signedIn();
    const other = cookieFrom((await login(user.email, BARBER_PASSWORD)).headers) ?? '';
    const third = cookieFrom((await login(user.email, BARBER_PASSWORD)).headers) ?? '';
    const out = await call(server.baseUrl, 'POST', '/api/auth/logout', { headers: { cookie } });
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie()[0]).toMatch(/Max-Age=0/);
    expect((await me(cookie)).status).toBe(401);
    expect((await me(other)).status).toBe(200);
    const all = await call(server.baseUrl, 'POST', '/api/auth/logout-all', {
      headers: { cookie: other },
    });
    expect(all.body).toEqual({ ok: true, sessionsEnded: 2 });
    expect((await me(other)).status).toBe(401);
    expect((await me(third)).status).toBe(401);
  });

  it('changing a password ends every other session but keeps this one', async () => {
    const { user, cookie } = await signedIn();
    const other = cookieFrom((await login(user.email, BARBER_PASSWORD)).headers) ?? '';
    const res = await call(server.baseUrl, 'POST', '/api/me/password', {
      headers: { cookie },
      body: { currentPassword: BARBER_PASSWORD, newPassword: 'fresh-new-phrase-for-me-8' },
    });
    expect(res.status).toBe(200);
    expect((await me(cookie)).status).toBe(200);
    expect((await me(other)).status).toBe(401);
  });

  it('tampered, malformed and foreign cookies are refused', async () => {
    const { cookie } = await signedIn();
    const value = cookie.split('=')[1] ?? '';
    const flipped = `${value.slice(0, -1)}${value.endsWith('A') ? 'B' : 'A'}`;
    expect((await me(`__Host-exq_session=${flipped}`)).status).toBe(401);
    expect((await me(`__Host-exq_session=${value}x`)).status).toBe(401);
    expect((await me(`exq_session=${value}`)).status).toBe(401);
    expect((await me('__Host-exq_session=')).status).toBe(401);
    expect(
      (
        await call(server.baseUrl, 'GET', '/api/auth/me', {
          headers: { authorization: `Bearer ${value}` },
        })
      ).status,
    ).toBe(401);
  });

  it('a disabled login loses its live sessions immediately', async () => {
    const { user, cookie } = await signedIn();
    await usersRepo.setUserActive(user._id, false, new Date());
    expect((await me(cookie)).status).toBe(401);
  });
});

describe('lockout bypass for known addresses', () => {
  it('lets an address that signed in recently pass a lockout caused by someone else', async () => {
    const owner = await createLogin({ role: 'owner', staffId: null });
    const home = '198.51.100.7';
    const attacker = '203.0.113.9';
    expect((await login(owner.email, OWNER_PASSWORD, home)).status).toBe(200);
    const stored = await usersRepo.findUserById(owner._id);
    expect(stored?.recentLoginIps).toHaveLength(1);
    expect(JSON.stringify(stored?.recentLoginIps)).not.toContain(home);

    for (let i = 0; i < 5; i += 1)
      expect((await login(owner.email, `wrong-guess-${i}`, attacker)).status).toBe(401);
    expect((await login(owner.email, OWNER_PASSWORD, attacker)).status).toBe(423);

    // The owner gets in from home, and the lock stays for everyone else.
    expect((await login(owner.email, OWNER_PASSWORD, home)).status).toBe(200);
    expect((await login(owner.email, OWNER_PASSWORD, attacker)).status).toBe(423);
    expect((await login(owner.email, OWNER_PASSWORD, '192.0.2.44')).status).toBe(423);

    // A wrong password from home is still a wrong password, and the IP limit still applies.
    await db().collection('rateLimits').deleteMany({});
    expect((await login(owner.email, 'not-the-password-1', home)).status).toBe(401);
    for (let i = 0; i < 25; i += 1) await login(`other${i}@example.com`, 'x-wrong-1', home);
    expect((await login(owner.email, OWNER_PASSWORD, home)).status).toBe(429);
  });

  it('keeps at most ten addresses and forgets the old ones', async () => {
    const owner = await createLogin({ role: 'owner', staffId: null });
    for (let i = 1; i <= 12; i += 1) {
      await db().collection('rateLimits').deleteMany({});
      expect((await login(owner.email, OWNER_PASSWORD, `198.51.100.${i}`)).status).toBe(200);
    }
    const stored = await usersRepo.findUserById(owner._id);
    expect(stored?.recentLoginIps).toHaveLength(10);
    await db()
      .collection<{ _id: string }>('users')
      .updateOne(
        { _id: owner._id },
        { $set: { 'recentLoginIps.0.at': new Date(Date.now() - 31 * 24 * 60 * 60_000) } },
      );
    await db().collection('rateLimits').deleteMany({});
    expect((await login(owner.email, OWNER_PASSWORD, '198.51.100.12')).status).toBe(200);
    expect((await usersRepo.findUserById(owner._id))?.recentLoginIps).toHaveLength(9);
  });
});

describe('the per-address limit', () => {
  it('counts failed attempts only, so a busy shop tablet can sign in as often as it likes', async () => {
    const owner = await createLogin({ role: 'owner', staffId: null });
    const tablet = '198.51.100.250';
    for (let i = 0; i < 25; i += 1) {
      await db().collection('loginThrottle').deleteMany({});
      // Neither counter moves on a success; the clears below only prove that nothing else interferes.
      await db()
        .collection('rateLimits')
        .deleteMany({ key: { $regex: /^login:account:/ } });
      expect((await login(owner.email, OWNER_PASSWORD, tablet)).status).toBe(200);
    }
    // Twenty failures from the same address do trip it, and the lockout answer comes first.
    for (let i = 0; i < 20; i += 1) {
      await db().collection('loginThrottle').deleteMany({});
      await db()
        .collection('rateLimits')
        .deleteMany({ key: { $regex: /^login:account:/ } });
      await login(owner.email, `wrong-${i}-xxxxxx`, tablet);
    }
    await db().collection('loginThrottle').deleteMany({});
    expect((await login(owner.email, OWNER_PASSWORD, tablet)).status).toBe(429);
  });
});
