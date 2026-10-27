import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE, TABLET_COOKIE } from '../../server/auth/cookies';
import { SESSION_IDLE_MS, SESSION_TABLET_IDLE_MS } from '../../server/auth/sessions';
import { runSeed } from '../../server/services/seedService';
import { staffSeedId } from '../../seed/shop';
import { createLogin, sessionCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();
let server: TestServer;
let userId: string;
const DAY = 24 * 60 * 60_000;
/* Frozen so the expiry arithmetic is exact; only Date is faked. */
const T0 = new Date('2026-10-27T15:00:00.000Z');

const cookieValue = (header: string | null, name: string): string | null => {
  const part = (header ?? '').split(/,(?=\s*__Host-)/).find((c) => c.trim().startsWith(`${name}=`));
  return part ? (part.split(';')[0]?.split('=')[1] ?? null) : null;
};

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: T0, shouldAdvanceTime: true });
  await runSeed(db(), NOW);
  server = await startTestServer();
  const login = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  userId = login._id;
});
afterAll(async () => {
  vi.useRealTimers();
  await server.close();
});

async function expiryOf(cookie: string): Promise<number> {
  const token = cookie.split('=')[1] ?? '';
  const { sha256Hex } = await import('../../server/lib/ids');
  const doc = await db()
    .collection<{ tokenHash: string; expiresAt: Date }>('sessions')
    .findOne({ tokenHash: sha256Hex(token) });
  return doc?.expiresAt.getTime() ?? 0;
}

describe('"Keep this tablet signed in"', () => {
  it('lengthens only the session on the device that holds the flag', async () => {
    const tablet = await sessionCookie(userId);
    const phone = await sessionCookie(userId);
    // The owner taps the button on the tablet: a device flag cookie comes back.
    const marked = await call(server.baseUrl, 'POST', '/api/auth/tablet', {
      headers: { cookie: tablet },
      body: {},
    });
    expect(marked.status).toBe(200);
    const flag = cookieValue(marked.headers.get('set-cookie'), TABLET_COOKIE);
    expect(flag).toMatch(/^[a-f0-9]{64}$/);
    // Two hours later both devices are used again; the touch refreshes each session's expiry.
    vi.setSystemTime(new Date(T0.getTime() + 2 * 60 * 60_000));
    const now = Date.now();
    const onTablet = await call(server.baseUrl, 'GET', '/api/auth/me', {
      headers: { cookie: `${tablet}; ${TABLET_COOKIE}=${flag ?? ''}` },
    });
    const onPhone = await call(server.baseUrl, 'GET', '/api/auth/me', {
      headers: { cookie: phone },
    });
    expect(onTablet.status).toBe(200);
    expect(onPhone.status).toBe(200);
    // Only Date is faked and it keeps advancing, so the expiries land within a few seconds.
    const near = (a: number, b: number) => Math.abs(a - b) < 5_000;
    expect(near(await expiryOf(tablet), now + SESSION_TABLET_IDLE_MS)).toBe(true);
    expect(near(await expiryOf(phone), now + SESSION_IDLE_MS)).toBe(true);
    expect(SESSION_TABLET_IDLE_MS).toBe(30 * DAY);
    // A made-up flag does nothing.
    const faked = await sessionCookie(userId);
    vi.setSystemTime(new Date(now + 2 * 60 * 60_000));
    await call(server.baseUrl, 'GET', '/api/auth/me', {
      headers: { cookie: `${faked}; ${TABLET_COOKIE}=${'a'.repeat(64)}` },
    });
    expect(near(await expiryOf(faked), Date.now() + SESSION_IDLE_MS)).toBe(true);
    expect(SESSION_COOKIE).toMatch(/^__Host-/);
  });
});
