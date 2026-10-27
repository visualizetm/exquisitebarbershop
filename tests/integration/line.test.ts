import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, staffSeedId } from '../../seed/shop';
import { bookingDetailResponseSchema, seatResponseSchema } from '../../shared/api/admin';
import { apiErrorSchema } from '../../shared/api/errors';
import { lineResponseSchema, walkInResponseSchema } from '../../shared/api/line';
import { createLogin, sessionCookie, teamCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
let leeCookie: string;
const cut = serviceSeedId('haircut');
const lee = staffSeedId('lee');
const drew = staffSeedId('drew');
const nelly = staffSeedId('nelly');
const dontrise = staffSeedId('dontrise');

function as(cookie: string) {
  return (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    call(server.baseUrl, method, path, {
      headers: { cookie, ...headers },
      ...(body === undefined ? {} : { body }),
    });
}
const owner = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
  as(ownerCookie)(method, path, body, headers);
const barber = (method: string, path: string, body?: unknown) => as(leeCookie)(method, path, body);
const codeOf = (body: unknown) => apiErrorSchema.parse(body).error.code;
const walkIn = (body: unknown) => walkInResponseSchema.parse(body).walkIn;
let n = 0;
const phone = () => `215555${String(2000 + (n += 1))}`;

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  const ownerLogin = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  ownerCookie = await sessionCookie(ownerLogin._id);
  leeCookie = await teamCookie(lee);
});
afterAll(async () => {
  await server.close();
});

describe('the walk-in line', () => {
  it('adds, orders, estimates and lets people leave; the phone is required and checked', async () => {
    const bad = await owner('POST', '/api/admin/line', {
      name: 'No Phone',
      phone: '123',
      serviceIds: [cut],
    });
    expect(bad.status).toBe(400);
    expect(codeOf(bad.body)).toBe('VALIDATION_ERROR');
    const noName = await owner('POST', '/api/admin/line', {
      name: '  ',
      phone: phone(),
      serviceIds: [cut],
    });
    expect(noName.status).toBe(400);

    const a = walkIn(
      (
        await owner('POST', '/api/admin/line', {
          name: 'Chris M',
          phone: '(215) 555-2101',
          serviceIds: [cut],
          staffId: null,
        })
      ).body,
    );
    expect(a).toMatchObject({
      status: 'waiting',
      position: 0,
      staffId: null,
      staffName: 'First available',
      phone: '(215) 555-2101',
      waitingMinutes: 0,
    });
    expect(a.services.map((s) => s.name)).toEqual(['Haircut']);
    expect(['free', 'about', 'unknown']).toContain(a.estimate.kind);
    expect(a.options.length).toBeGreaterThan(0);

    const b = walkIn(
      (
        await owner('POST', '/api/admin/line', {
          name: 'Tony B',
          phone: phone(),
          serviceIds: [cut],
          staffId: drew,
        })
      ).body,
    );
    const c = walkIn(
      (await owner('POST', '/api/admin/line', { name: 'Third', phone: phone(), serviceIds: [cut] }))
        .body,
    );
    expect([b.position, c.position]).toEqual([1, 2]);

    // Move the third one up, then up again, then the first one down does nothing at the end.
    const moved = lineResponseSchema.parse(
      (await owner('POST', `/api/admin/line/${c.id}/move`, { direction: 'up' })).body,
    );
    expect(moved.line.map((w) => w.name)).toEqual(['Chris M', 'Third', 'Tony B']);
    const top = lineResponseSchema.parse(
      (await owner('POST', `/api/admin/line/${c.id}/move`, { direction: 'up' })).body,
    );
    expect(top.line.map((w) => w.name)).toEqual(['Third', 'Chris M', 'Tony B']);
    const same = lineResponseSchema.parse(
      (await owner('POST', `/api/admin/line/${b.id}/move`, { direction: 'down' })).body,
    );
    expect(same.line.map((w) => w.name)).toEqual(['Third', 'Chris M', 'Tony B']);

    // Change the chair, then leave.
    const changed = walkIn(
      (await owner('PATCH', `/api/admin/line/${b.id}`, { staffId: lee })).body,
    );
    expect(changed.staffName).toBe('Lee');
    const left = walkIn((await owner('POST', `/api/admin/line/${c.id}/left`, {})).body);
    expect(left.status).toBe('left');
    const line = lineResponseSchema.parse((await owner('GET', '/api/admin/line')).body);
    expect(line.line.map((w) => w.name)).toEqual(['Chris M', 'Tony B']);
    expect(line.chairs.map((ch) => ch.name)).toContain('Lee');
    const again = await owner('POST', `/api/admin/line/${c.id}/seat`, { staffId: lee });
    expect(again.status).toBe(409);
    expect(codeOf(again.body)).toBe('INVALID_TRANSITION');

    const audit = await db()
      .collection<{ action: string }>('auditLog')
      .find({ entityType: 'walkIn' })
      .toArray();
    expect(new Set(audit.map((e) => e.action))).toEqual(
      new Set(['line.add', 'line.move', 'line.update', 'line.left']),
    );
  });

  it('seats into a free chair as a real walk-in booking with arrivedAt, and refuses a busy chair with the estimate', async () => {
    const w = walkIn(
      (
        await owner('POST', '/api/admin/line', {
          name: 'Seat Me',
          phone: phone(),
          serviceIds: [cut],
          staffId: nelly,
        })
      ).body,
    );
    const seated = seatResponseSchema.parse(
      (await owner('POST', `/api/admin/line/${w.id}/seat`, {})).body,
    );
    expect(seated.walkIn).toMatchObject({ status: 'seated', bookingId: seated.booking.id });
    expect(seated.booking).toMatchObject({
      source: 'walkIn',
      status: 'confirmed',
      staff: { id: nelly },
      customer: { name: 'Seat Me' },
    });
    expect(seated.booking.arrivedAt).not.toBeNull();
    // The slots are locked for the booking.
    const locks = await db()
      .collection<{ holderId: string }>('slotLocks')
      .countDocuments({ holderId: seated.booking.id });
    expect(locks).toBeGreaterThan(0);
    // Seating twice answers that they are already in a chair.
    const twice = await owner('POST', `/api/admin/line/${w.id}/seat`, {});
    expect(twice.status).toBe(409);
    expect(codeOf(twice.body)).toBe('ALREADY_SEATED');

    // Nelly is busy for the cut now: the next person for Nelly is refused with an estimate.
    const next = walkIn(
      (
        await owner('POST', '/api/admin/line', {
          name: 'Too Soon',
          phone: phone(),
          serviceIds: [cut],
          staffId: nelly,
        })
      ).body,
    );
    expect(next.estimate.kind).toBe('about');
    const refused = await owner('POST', `/api/admin/line/${next.id}/seat`, {});
    expect(refused.status).toBe(409);
    expect(codeOf(refused.body)).toBe('CHAIR_BUSY');
    expect((refused.body as { error: { estimate: { kind: string } } }).error.estimate.kind).toBe(
      'about',
    );
    const still = walkIn(
      (await owner('PATCH', `/api/admin/line/${next.id}`, { staffId: drew })).body,
    );
    expect(still.status).toBe('waiting');
  });

  it('two seats into the same free chair at once give one booking and one refusal', async () => {
    const ids: string[] = [];
    for (const name of ['Race One', 'Race Two']) {
      ids.push(
        walkIn(
          (
            await owner('POST', '/api/admin/line', {
              name,
              phone: phone(),
              serviceIds: [cut],
              staffId: dontrise,
            })
          ).body,
        ).id,
      );
    }
    const results = await Promise.all(
      ids.map((id) => owner('POST', `/api/admin/line/${id}/seat`, {})),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    const refused = results.find((r) => r.status === 409);
    expect(codeOf(refused?.body)).toBe('CHAIR_BUSY');
    const bookings = await db()
      .collection<{ staffId: string; status: string }>('bookings')
      .countDocuments({ staffId: dontrise, status: 'confirmed', source: 'walkIn' });
    expect(bookings).toBe(1);
    // The loser is back in the line, not stuck as seated.
    const line = lineResponseSchema.parse((await owner('GET', '/api/admin/line')).body);
    const loser = ids.find(
      (id) =>
        id !== seatResponseSchema.parse(results.find((r) => r.status === 201)?.body).walkIn.id,
    );
    expect(line.line.some((w) => w.id === loser && w.status === 'waiting')).toBe(true);
  });

  it('a barber sees the line, adds to it and seats only into their own chair', async () => {
    const seen = lineResponseSchema.parse((await barber('GET', '/api/team/line')).body);
    expect(Array.isArray(seen.line)).toBe(true);
    const mine = walkIn(
      (
        await barber('POST', '/api/team/line', {
          name: 'For Lee',
          phone: phone(),
          serviceIds: [cut],
          staffId: lee,
        })
      ).body,
    );
    const elsewhere = walkIn(
      (
        await barber('POST', '/api/team/line', {
          name: 'For Drew',
          phone: phone(),
          serviceIds: [cut],
          staffId: drew,
        })
      ).body,
    );
    // Seating always lands in the barber's own chair, whoever the walk-in asked for.
    const seated = seatResponseSchema.parse(
      (await barber('POST', `/api/team/line/${mine.id}/seat`, {})).body,
    );
    expect(seated.booking.staff.id).toBe(lee);
    const other = await barber('POST', `/api/team/line/${elsewhere.id}/seat`, {});
    // Lee's chair is now busy, so the second seat is refused, and never lands on Drew.
    expect(other.status).toBe(409);
    const drews = await db()
      .collection<{ staffId: string }>('bookings')
      .countDocuments({ staffId: drew, source: 'walkIn' });
    expect(drews).toBe(0);
    // Owner-only moves are refused for a barber.
    const move = await barber('POST', `/api/admin/line/${elsewhere.id}/move`, { direction: 'up' });
    expect([401, 403]).toContain(move.status);
    // The owner's booking view of the seated walk-in says walk-in and arrived.
    const view = bookingDetailResponseSchema.parse(
      (await owner('GET', `/api/admin/bookings/${seated.booking.id}`)).body,
    );
    expect(view.booking.source).toBe('walkIn');
  });
});
