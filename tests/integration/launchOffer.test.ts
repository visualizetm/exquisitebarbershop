import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBookingResponseSchema } from '../../shared/api/bookings';
import { bookingsRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId } from '../../seed/shop';
import { NOW, useTestDb } from '../helpers/db';
import {
  call,
  idemKey,
  nextDate,
  phone,
  slotAt,
  startTestServer,
  type TestServer,
} from '../helpers/bookingApi';

/** The launch offer: once per phone, decided inside the booking transaction. */
process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
const WED = nextDate(3, 3);
const THU = nextDate(4, 3);
const cutId = serviceSeedId('haircut');

function post(payload: Record<string, unknown>) {
  return call(server.baseUrl, 'POST', '/api/bookings', {
    body: {
      serviceIds: [cutId],
      staff: 'drew',
      customer: { name: 'Offer Customer', phone: phone(), email: null },
      ...payload,
    },
    headers: { 'idempotency-key': idemKey() },
  });
}

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

describe('the launch offer', () => {
  it('goes to the first online booking only, and a cancelled first frees it', async () => {
    const p = phone();
    const first = await post({
      startAt: slotAt(WED, '10:00'),
      customer: { name: 'A', phone: p, email: null },
    });
    expect(first.status).toBe(201);
    const one = createBookingResponseSchema.parse(first.body);
    expect(one.booking.discounts).toEqual([
      { code: 'LAUNCH10', amountCents: 1000, label: '$10 off your first online booking' },
    ]);

    const second = await post({
      startAt: slotAt(WED, '14:00'),
      customer: { name: 'A', phone: p, email: null },
    });
    expect(second.status).toBe(201);
    expect(createBookingResponseSchema.parse(second.body).booking.discounts).toEqual([]);

    await bookingsRepo.cancelBooking(
      one.booking.id,
      { at: NOW, by: 'customer', reason: null },
      NOW,
    );
    await bookingsRepo.cancelBooking(
      createBookingResponseSchema.parse(second.body).booking.id,
      { at: NOW, by: 'customer', reason: null },
      NOW,
    );
    const third = await post({
      startAt: slotAt(THU, '10:00'),
      customer: { name: 'A', phone: p, email: null },
    });
    expect(third.status).toBe(201);
    expect(createBookingResponseSchema.parse(third.body).booking.discounts).toHaveLength(1);
    expect(await bookingsRepo.launchOfferUsage()).toEqual({ count: 1, amountCents: 1000 });
  });

  it('two first bookings placed at the same moment: exactly one carries it', async () => {
    const p = phone();
    const results = await Promise.all([
      post({ startAt: slotAt(WED, '11:00'), customer: { name: 'B', phone: p, email: null } }),
      post({ startAt: slotAt(WED, '15:00'), customer: { name: 'B', phone: p, email: null } }),
      post({ startAt: slotAt(THU, '11:00'), customer: { name: 'B', phone: p, email: null } }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    const given = results
      .map((r) => createBookingResponseSchema.parse(r.body).booking.discounts.length)
      .reduce((a, b) => a + b, 0);
    expect(given).toBe(1);
  });
});
