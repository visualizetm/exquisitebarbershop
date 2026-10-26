import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  availabilityDaysResponseSchema,
  availabilityResponseSchema,
} from '../../shared/api/availability';
import { apiErrorSchema } from '../../shared/api/errors';
import { closuresRepo, staffRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { serviceSeedId, staffSeedId } from '../../seed/shop';
import { NOW, useTestDb } from '../helpers/db';
import { call, nextDate, startTestServer, type TestServer } from '../helpers/bookingApi';

const { db } = useTestDb();
let server: TestServer;
const cutId = serviceSeedId('haircut');

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

describe('GET /api/availability', () => {
  it('returns slots for a day with short caching', async () => {
    const wed = nextDate(3, 3);
    const res = await call(
      server.baseUrl,
      'GET',
      `/api/availability?date=${wed}&serviceIds=${cutId}&staff=lee`,
    );
    expect(res.status).toBe(200);
    const parsed = availabilityResponseSchema.parse(res.body);
    // 45 minutes plus the 10 minute buffer.
    expect(parsed.durationMinutes).toBe(55);
    expect(parsed.slots.length).toBeGreaterThan(20);
    expect(parsed.slots.every((s) => s.staffId === staffSeedId('lee'))).toBe(true);
    expect(parsed.reason).toBeNull();
    expect(res.headers.get('cache-control')).toBe('public, max-age=10');
  });

  it('explains empty days and validates input', async () => {
    const mon = nextDate(1, 3);
    const closed = availabilityResponseSchema.parse(
      (await call(server.baseUrl, 'GET', `/api/availability?date=${mon}&serviceIds=${cutId}`)).body,
    );
    expect(closed.reason).toBe('closed');
    expect(closed.closedReason).toBe('The shop is closed that day');
    // Drew works Tuesday to Saturday, so Sunday is his day off while the shop is open.
    const sun = nextDate(7, 3);
    const off = availabilityResponseSchema.parse(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/availability?date=${sun}&serviceIds=${cutId}&staff=drew`,
        )
      ).body,
    );
    expect(off.reason).toBe('dayOff');
    const tue = nextDate(2, 3);
    const bad = await call(
      server.baseUrl,
      'GET',
      `/api/availability?date=2026-13-40&serviceIds=${cutId}`,
    );
    expect(bad.status).toBe(400);
    const nobody = await call(
      server.baseUrl,
      'GET',
      `/api/availability?date=${tue}&serviceIds=${cutId}&staff=nobody`,
    );
    expect(nobody.status).toBe(404);
    const beauty = availabilityResponseSchema.parse(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/availability?date=${tue}&serviceIds=${serviceSeedId('female-cut')}&staff=lee`,
        )
      ).body,
    );
    expect(beauty.reason).toBe('noQualifiedStaff');
    const unknownService = await call(
      server.baseUrl,
      'GET',
      `/api/availability?date=${tue}&serviceIds=64a1f2c3d4e5f60718293a4b`,
    );
    expect(apiErrorSchema.parse(unknownService.body).error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('resolves an old slug alias', async () => {
    const drew = await staffRepo.findStaffById(staffSeedId('drew'));
    await staffRepo.renameStaffSlug(drew?._id ?? '', 'drew-renamed', NOW);
    const wed = nextDate(3, 3);
    const res = availabilityResponseSchema.parse(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/availability?date=${wed}&serviceIds=${cutId}&staff=drew`,
        )
      ).body,
    );
    expect(res.slots[0]?.staffId).toBe(staffSeedId('drew'));
  });
});

describe('GET /api/availability/days', () => {
  it('covers the booking window by default and marks closed and off days', async () => {
    const res = await call(
      server.baseUrl,
      'GET',
      `/api/availability/days?serviceIds=${cutId}&staff=any`,
    );
    expect(res.status).toBe(200);
    const parsed = availabilityDaysResponseSchema.parse(res.body);
    expect(parsed.days).toHaveLength(31);
    expect(parsed.availableDates.length).toBeGreaterThan(15);
    const mondays = parsed.days.filter((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay() === 1);
    expect(mondays.every((d) => d.reason === 'closed' && !d.available)).toBe(true);
    // Sunday is a working day now. Today is left out: it may already be past closing.
    const sundays = parsed.days
      .slice(1)
      .filter((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay() === 0);
    expect(sundays.length).toBeGreaterThan(0);
    expect(sundays.every((d) => d.available)).toBe(true);
    expect(res.headers.get('cache-control')).toBe('public, max-age=30');
  });

  it('honours an explicit range, a closure, and rejects an inverted range', async () => {
    const wed = nextDate(3, 7);
    await closuresRepo.upsertClosure({ date: wed, kind: 'closed', label: 'Inventory' }, NOW);
    const res = availabilityDaysResponseSchema.parse(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/availability/days?serviceIds=${cutId}&from=${wed}&to=${wed}`,
        )
      ).body,
    );
    expect(res.days).toEqual([{ date: wed, available: false, reason: 'closed', count: 0 }]);
    const inverted = await call(
      server.baseUrl,
      'GET',
      `/api/availability/days?serviceIds=${cutId}&from=${wed}&to=${nextDate(3, 3)}`,
    );
    expect(inverted.status).toBe(400);
  });
});
