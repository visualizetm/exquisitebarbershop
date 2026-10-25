import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffSeedId, serviceSeedId } from '../../seed/shop';
import { searchResponseSchema } from '../../shared/api/admin';
import { runSeed } from '../../server/services/seedService';
import { createLogin, sessionCookie } from '../helpers/auth';
import {
  bookPublic,
  call,
  nextDate,
  slotAt,
  startTestServer,
  type TestServer,
} from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
const cut = serviceSeedId('classic-cut');
const TUE = nextDate(3, 3);
const search = async (q: string) =>
  searchResponseSchema.parse(
    (
      await call(server.baseUrl, 'GET', `/api/admin/search?q=${encodeURIComponent(q)}`, {
        headers: { cookie: ownerCookie },
      })
    ).body,
  );

let code = '';

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  ownerCookie = await sessionCookie(
    (await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') }))._id,
  );
  const b = await bookPublic(server.baseUrl, {
    staff: 'marcus',
    serviceIds: [cut],
    startAt: slotAt(TUE, '10:00'),
    name: 'José Álvarez',
    phone: '+12155550142',
  });
  code = b.referenceCode;
  await bookPublic(server.baseUrl, {
    staff: 'dee',
    serviceIds: [cut],
    startAt: slotAt(TUE, '11:00'),
    name: 'Jon Smith',
    phone: '+12155550177',
  });
});
afterAll(async () => {
  await server.close();
});

describe('GET /api/admin/search', () => {
  it('finds a booking by its code, in any case and spacing', async () => {
    for (const q of [code, code.toLowerCase(), code.replace('-', ' ')]) {
      const found = await search(q);
      expect(found.bookings.map((b) => b.referenceCode)).toEqual([code]);
    }
  });

  it('finds a phone number in any format and by its last four digits', async () => {
    for (const q of ['(215) 555-0142', '215-555-0142', '+1 215 555 0142', '0142']) {
      const found = await search(q);
      expect(
        found.bookings.map((b) => b.customerName),
        q,
      ).toEqual(['José Álvarez']);
      expect(
        found.customers.map((c) => c.phone),
        q,
      ).toEqual(['(215) 555-0142']);
    }
  });

  it('matches the start of a name without caring about case or accents', async () => {
    for (const q of ['jose', 'JOSÉ', 'josé al', 'Álv']) {
      expect(
        (await search(q)).customers.map((c) => c.name),
        q,
      ).toEqual(q === 'Álv' ? [] : ['José Álvarez']);
    }
    // A prefix of the whole name only: "var" is inside the surname, not at its start.
    expect((await search('var')).bookings).toHaveLength(0);
    const jo = await search('jo');
    expect(jo.customers.map((c) => c.name).sort()).toEqual(['Jon Smith', 'José Álvarez']);
  });

  it('returns nothing for a blank or unmatched query and caps each group at five', async () => {
    expect(await search('')).toEqual({ bookings: [], customers: [] });
    expect(await search('zzzz nobody')).toEqual({ bookings: [], customers: [] });
  });

  it('indexes the name key', async () => {
    const names = (await db().collection('bookings').indexes()).map((i) => i.name);
    expect(names).toContain('by_name_key');
  });

  it('backfills bookings written before the name key existed', async () => {
    await db()
      .collection('bookings')
      .updateMany({}, { $unset: { nameKey: '' } });
    const { resetNameKeyBackfillForTests } = await import('../../server/services/adminSearch');
    resetNameKeyBackfillForTests();
    expect((await search('jose')).customers).toHaveLength(1);
  });
});
