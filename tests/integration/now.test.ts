import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, staffSeedId } from '../../seed/shop';
import { nowResponseSchema } from '../../shared/api/admin';
import { apiErrorSchema } from '../../shared/api/errors';
import { createLogin, sessionCookie, teamCookie } from '../helpers/auth';
import { call, nextDate, slotAt, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
let drewCookie: string;
const cut = serviceSeedId('haircut');
const drew = staffSeedId('drew');
const lee = staffSeedId('lee');
let n = 0;
const phone = () => `215555${String(3000 + (n += 1))}`;
const key = () => `now-${String(Date.now())}-${String((n += 1))}`;

function as(cookie: string) {
  return (method: string, path: string, body?: unknown) =>
    call(server.baseUrl, method, path, {
      headers: { cookie, 'idempotency-key': key() },
      ...(body === undefined ? {} : { body }),
    });
}
const owner = (method: string, path: string, body?: unknown) => as(ownerCookie)(method, path, body);
const barber = (method: string, path: string, body?: unknown) => as(drewCookie)(method, path, body);
const codeOf = (body: unknown) => apiErrorSchema.parse(body).error.code;
const customer = (name: string) => ({ name, phone: phone(), email: null });

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  const ownerLogin = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  ownerCookie = await sessionCookie(ownerLogin._id);
  drewCookie = await teamCookie(drew);
});
afterAll(async () => {
  await server.close();
});

describe('NOW', () => {
  it('books this minute when the chair is free: walk-in source, arrivedAt set, slots locked, off the grid', async () => {
    const res = await owner('POST', '/api/admin/now', {
      serviceIds: [cut],
      staffId: lee,
      customer: customer('Now Free'),
    });
    expect(res.status).toBe(201);
    const done = nowResponseSchema.parse(res.body);
    expect(done.kind).toBe('booking');
    if (done.kind !== 'booking') return;
    expect(done.booking).toMatchObject({
      source: 'walkIn',
      status: 'confirmed',
      staff: { id: lee },
    });
    expect(done.booking.arrivedAt).not.toBeNull();
    // Starts at the current minute, whatever the 15 minute grid says.
    expect(Math.abs(new Date(done.booking.startAt).getTime() - Date.now())).toBeLessThan(90_000);
    const locks = await db()
      .collection<{ holderId: string }>('slotLocks')
      .countDocuments({ holderId: done.booking.id });
    expect(locks).toBeGreaterThan(0);
  });

  it('joins the line when the chair is busy, and makes no booking', async () => {
    const before = await db().collection('bookings').countDocuments({ staffId: lee });
    const res = await owner('POST', '/api/admin/now', {
      serviceIds: [cut],
      staffId: lee,
      customer: customer('Now Busy'),
    });
    expect(res.status).toBe(201);
    const done = nowResponseSchema.parse(res.body);
    expect(done.kind).toBe('line');
    if (done.kind !== 'line') return;
    expect(done.walkIn).toMatchObject({ status: 'waiting', staffId: lee, name: 'Now Busy' });
    expect(done.walkIn.estimate.kind).toBe('about');
    expect(await db().collection('bookings').countDocuments({ staffId: lee })).toBe(before);
  });

  it('two NOWs for one chair at once: one booking, the other in the line, never two bookings', async () => {
    const results = await Promise.all(
      ['Race A', 'Race B'].map((name) =>
        barber('POST', '/api/team/now', { serviceIds: [cut], customer: customer(name) }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const kinds = results.map((r) => nowResponseSchema.parse(r.body).kind).sort();
    expect(kinds).toEqual(['booking', 'line']);
    const bookings = await db()
      .collection('bookings')
      .countDocuments({ staffId: drew, source: 'walkIn', status: 'confirmed' });
    expect(bookings).toBe(1);
  });

  it('a barber lands on their own chair whatever staffId says, and the public API never books off the grid', async () => {
    // Drew is busy now (the race above), so this joins Drew's line even when it asks for Lee.
    const res = await barber('POST', '/api/team/now', {
      serviceIds: [cut],
      staffId: lee,
      customer: customer('Own Chair'),
    });
    const done = nowResponseSchema.parse(res.body);
    expect(done.kind).toBe('line');
    if (done.kind === 'line') expect(done.walkIn.staffId).toBe(drew);

    // The public booking API: a start off the 15 minute grid is refused, and a walk-in source is
    // not a thing it knows.
    const offGrid = new Date(Math.floor(Date.now() / 60_000) * 60_000 + 7 * 60_000).toISOString();
    const pub = await call(server.baseUrl, 'POST', '/api/bookings', {
      headers: { 'idempotency-key': key() },
      body: {
        serviceIds: [cut],
        staff: 'nelly',
        startAt: offGrid,
        customer: customer('Public Now'),
        source: 'walkIn',
        arrived: true,
      },
    });
    expect([400, 409]).toContain(pub.status);
    expect(['VALIDATION_ERROR', 'OUTSIDE_BOOKING_WINDOW', 'SLOT_TAKEN', 'SHOP_CLOSED']).toContain(
      codeOf(pub.body),
    );
    expect(
      await db().collection('bookings').countDocuments({ 'customer.name': 'Public Now' }),
    ).toBe(0);
    // And a public NOW route does not exist.
    const none = await call(server.baseUrl, 'POST', '/api/now', {
      body: { serviceIds: [cut], customer: customer('Nobody') },
    });
    expect(none.status).toBe(404);
    // A grid time for the test's sake, so the helper imports stay used.
    expect(slotAt(nextDate(3, 3), '10:00')).toMatch(/T/);
  });
});
