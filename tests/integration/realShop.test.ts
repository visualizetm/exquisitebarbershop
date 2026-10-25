import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  servicesSeed,
  shopHoursSeed,
  shopSettingsSeed,
  serviceSeedId,
  staffSeed,
  staffSeedId,
} from '../../seed/shop';
import {
  availabilityResponseSchema,
  nextOpeningsResponseSchema,
} from '../../shared/api/availability';
import { settingsResponseSchema } from '../../shared/api/admin';
import {
  publicServicesResponseSchema,
  publicShopSchema,
  publicStaffListResponseSchema,
  publicStaffResponseSchema,
  staffOpeningsResponseSchema,
} from '../../shared/api/public';
import { apiErrorSchema } from '../../shared/api/errors';
import { googleMapsUrl, googleReviewUrl } from '../../shared/lib/google';
import { shopSettingsRepo, staffRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { createLogin, sessionCookie } from '../helpers/auth';
import { call, idemKey, nextDate, phone, slotAt, startTestServer } from '../helpers/bookingApi';
import type { TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;

const get = (path: string) => call(server.baseUrl, 'GET', path);
const haircut = serviceSeedId('haircut');
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

function post(body: Record<string, unknown>) {
  return call(server.baseUrl, 'POST', '/api/bookings', {
    body: {
      customer: { name: 'Iniya Check', phone: phone(), email: null },
      ...body,
    },
    headers: { 'idempotency-key': idemKey() },
  });
}

describe('the shop facts', () => {
  it('/api/shop serves the real address, phone, hours, announcement and Google block', async () => {
    const res = await get('/api/shop');
    expect(res.status).toBe(200);
    const shop = publicShopSchema.parse(res.body);
    expect(shop.address).toEqual({
      line1: '3309 Edgmont Ave',
      line2: 'Suite F',
      city: 'Brookhaven',
      state: 'PA',
      postalCode: '19015',
    });
    expect(shop.phone).toBe('+16106090786');
    expect(shop.instagramHandle).toBe('exquisitebarberbeauty');
    expect(shop.social).toEqual({
      instagramUrl: 'https://instagram.com/exquisitebarberbeauty',
      tiktokUrl: '',
      facebookUrl: '',
    });
    expect(shop.announcement).toEqual({
      enabled: true,
      text: 'Walk-ins welcome',
      linkLabel: 'Book online',
      linkUrl: '/book',
      endsOn: '',
    });
    expect(shop.google).toEqual({
      placeId: 'ChIJISdW6zTpxokRzSBEJjMQU4M',
      rating: 4.7,
      reviewCount: 15,
      ratingCheckedOn: '2026-10-25',
    });
    // The two links the pages build from the place id.
    expect(googleMapsUrl(shop.google?.placeId ?? '', shop.name)).toBe(
      'https://www.google.com/maps/search/?api=1&query=Exquisite%20Barber%20%26%20Beauty%20Lounge&query_place_id=ChIJISdW6zTpxokRzSBEJjMQU4M',
    );
    expect(googleReviewUrl(shop.google?.placeId ?? '')).toBe(
      'https://search.google.com/local/writereview?placeid=ChIJISdW6zTpxokRzSBEJjMQU4M',
    );
  });

  it('is closed Mondays and open 10:00 to 19:00 Tuesday to Sunday', async () => {
    const { hours } = publicShopSchema.parse((await get('/api/shop')).body);
    expect(hours.mon).toEqual([]);
    for (const day of ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const) {
      expect(hours[day], day).toEqual([{ start: '10:00', end: '19:00' }]);
    }
    expect(hours).toEqual(shopHoursSeed);
  });

  it('keeps the placeholder email off the public API, and the owner personal number out of every public answer', async () => {
    const shop = publicShopSchema.parse((await get('/api/shop')).body);
    expect(shop.email).toBe('');
    // The settings the owner edits still carry the stored value.
    expect((await shopSettingsRepo.requireShopSettings()).email).toBe(shopSettingsSeed.email);
    for (const path of ['/api/shop', '/api/staff', '/api/services', '/api/sitemap.xml']) {
      const text = JSON.stringify((await get(path)).body);
      expect(text, path).not.toMatch(/560.?9806|2525609806/);
      expect(text, path).not.toContain('555-0100');
    }
  });

  it('shows the email once it is a real address', async () => {
    const settings = await shopSettingsRepo.requireShopSettings();
    await shopSettingsRepo.updateShopSettings(
      { ...settings, email: 'chair@realshop.example' },
      NOW,
    );
    try {
      expect(publicShopSchema.parse((await get('/api/shop')).body).email).toBe(
        'chair@realshop.example',
      );
    } finally {
      await shopSettingsRepo.updateShopSettings({ ...settings }, NOW);
    }
  });

  it('serves the 15 real services, with no made up beauty or braid services', async () => {
    const { services } = publicServicesResponseSchema.parse((await get('/api/services')).body);
    expect(services).toHaveLength(15);
    expect(services.map((s) => s.name).sort()).toEqual(
      servicesSeed.map((s) => s.input.name).sort(),
    );
    const names = services.map((s) => s.name).join('|');
    for (const gone of [
      'Silk Press',
      'Wash and Style',
      'Twist Out',
      'Braids',
      'Locs',
      'Classic Cut',
    ]) {
      expect(names).not.toContain(gone);
    }
    expect(services.find((s) => s.name === 'Female Haircut')?.group).toBe('Beauty');
    expect(services.filter((s) => s.group === 'Beauty')).toHaveLength(1);
    const haircutRow = services.find((s) => s.id === haircut);
    expect(haircutRow).toMatchObject({ priceCents: 4000, priceFrom: true, durationMinutes: 45 });
    // Every price is whole cents.
    expect(services.every((s) => Number.isInteger(s.priceCents))).toBe(true);
  });
});

describe('the team', () => {
  it('lists the owner and four more, in chair order, with the real names and Instagram handles', async () => {
    const { staff } = publicStaffListResponseSchema.parse((await get('/api/staff')).body);
    expect(staff.map((s) => [s.slug, s.name, s.chairNumber])).toEqual([
      ['dontrise', 'Dontrise', 1],
      ['lee', 'Lee', 2],
      ['drew', 'Drew', 3],
      ['nelly', 'Nelly Cutz', 4],
      ['iniya', 'Iniya', 5],
    ]);
    expect(staff.map((s) => s.instagramHandle)).toEqual([
      'dontrisethebarber',
      'lee_dabarber_',
      'drew2sharp',
      'nellycutz_',
      'iniyathestylist',
    ]);
    expect(staff.find((s) => s.slug === 'drew')?.title).toBe('Barber, known as 2Sharp');
    expect(staff.find((s) => s.slug === 'dontrise')?.title).toBe('Owner and Barber');
    expect(staff.find((s) => s.slug === 'iniya')?.title).toBe('Braider');
  });

  it('gives each barber the services on their own menu', async () => {
    const { staff } = publicStaffListResponseSchema.parse((await get('/api/staff')).body);
    const keysOf = (slug: string) =>
      servicesSeed
        .filter((s) =>
          staff.find((m) => m.slug === slug)?.serviceIds.includes(serviceSeedId(s.key)),
        )
        .map((s) => s.key);
    expect(keysOf('drew')).toEqual([
      'haircut',
      'cut-beard',
      'cut-design',
      'kids-cut',
      'lineup',
      'hot-towel',
      'big-chop',
      'color-cut',
      'perm-cut',
      'eyebrows',
    ]);
    expect(keysOf('nelly')).toEqual(['haircut', 'kids-cut', 'steam-fade']);
    expect(keysOf('lee')).toEqual(['haircut', 'cut-beard', 'cut-design', 'kids-cut', 'lineup']);
    expect(keysOf('dontrise')).toEqual([
      'haircut',
      'cut-design',
      'kids-cut',
      'kids-design',
      'lineup',
      'color-cut',
      'female-cut',
      'father-son',
      'friends-cut',
    ]);
    expect(keysOf('iniya')).toEqual([]);
  });

  it('writes no em dash and no made up name into any bio, title or specialty', () => {
    for (const member of staffSeed) {
      const text = [member.input.bio, member.input.title, member.input.specialty].join(' ');
      expect(text, member.key).not.toContain(String.fromCharCode(0x2014));
    }
    const names = staffSeed.map((m) => m.input.name);
    for (const old of ['Marcus', 'Dee', 'Tre', 'Jay', 'Kris']) expect(names).not.toContain(old);
  });

  it('Drew works Tuesday to Saturday, 10:00 to 18:00, and nobody else has a short week', () => {
    const drew = staffSeed.find((m) => m.key === 'drew');
    for (const day of ['tue', 'wed', 'thu', 'fri', 'sat'] as const) {
      expect(drew?.hours[day], day).toEqual([{ start: '10:00', end: '18:00' }]);
    }
    expect(drew?.hours.sun).toEqual([]);
    expect(drew?.hours.mon).toEqual([]);
    for (const key of ['dontrise', 'lee', 'nelly']) {
      expect(staffSeed.find((m) => m.key === key)?.hours).toEqual(shopHoursSeed);
    }
  });

  it('a Monday booking is refused and a Sunday one is not', async () => {
    const mon = await post({
      serviceIds: [haircut],
      staff: 'lee',
      startAt: slotAt(nextDate(1, 3), '12:00'),
    });
    expect(apiErrorSchema.parse(mon.body).error.code).toBe('SHOP_CLOSED');
    const sun = await post({
      serviceIds: [haircut],
      staff: 'lee',
      startAt: slotAt(nextDate(7, 3), '12:00'),
    });
    expect(sun.status).toBe(201);
  });
});

describe('Iniya takes bookings on Instagram', () => {
  it('is on the website with a profile, no online booking and no services', async () => {
    const res = await get('/api/staff/iniya');
    expect(res.status).toBe(200);
    const { staff } = publicStaffResponseSchema.parse(res.body);
    expect(staff).toMatchObject({
      slug: 'iniya',
      name: 'Iniya',
      acceptsOnlineBooking: false,
      serviceIds: [],
      instagramHandle: 'iniyathestylist',
      photoUrl: null,
      photo: null,
      specialty: 'Braids and wigs',
    });
    expect(staff.bio).toBe('Braiding since 2020. Book through Instagram for now.');
  });

  it('is never bookable: a named booking is refused with STAFF_UNAVAILABLE', async () => {
    for (const serviceIds of [[haircut], [serviceSeedId('lineup')], []]) {
      const res = await post({
        serviceIds,
        staff: 'iniya',
        startAt: slotAt(nextDate(3, 3), '12:00'),
      });
      expect(res.status, JSON.stringify(serviceIds)).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    const named = await post({
      serviceIds: [haircut],
      staff: 'iniya',
      startAt: slotAt(nextDate(3, 3), '12:00'),
    });
    expect(apiErrorSchema.parse(named.body).error.code).toBe('STAFF_UNAVAILABLE');
    expect(await db().collection('bookings').countDocuments({ staffId: iniya })).toBe(0);
  });

  it('offers no times for her, with a reason, and /book?barber=iniya is not an error', async () => {
    const wed = nextDate(3, 3);
    const res = await get(`/api/availability?date=${wed}&serviceIds=${haircut}&staff=iniya`);
    expect(res.status).toBe(200);
    const body = availabilityResponseSchema.parse(res.body);
    expect(body.slots).toEqual([]);
    expect(body.reason).toBe('noQualifiedStaff');
  });

  it('is never picked as first available, on any day or at any time', async () => {
    const seen = new Set<string>();
    for (const weekday of [2, 3, 4, 5, 6, 7]) {
      const date = nextDate(weekday, 3);
      const body = availabilityResponseSchema.parse(
        (await get(`/api/availability?date=${date}&serviceIds=${haircut}&staff=any`)).body,
      );
      expect(body.slots.length, date).toBeGreaterThan(0);
      for (const slot of body.slots) seen.add(slot.staffId);
    }
    expect(seen.has(iniya)).toBe(false);
    // Every pick is one of the four chairs that take online bookings.
    const bookable = ['dontrise', 'lee', 'drew', 'nelly'].map(staffSeedId);
    expect(seen.size).toBeGreaterThan(0);
    expect([...seen].every((id) => bookable.includes(id))).toBe(true);
    // A first available booking lands on someone who takes online bookings.
    const booked = await post({
      serviceIds: [haircut],
      staff: 'any',
      startAt: slotAt(nextDate(4, 3), '11:00'),
    });
    expect(booked.status).toBe(201);
    const stored = await db()
      .collection('bookings')
      .findOne({ referenceCode: { $exists: true } });
    expect(stored?.staffId).not.toBe(iniya);
  });

  it('stays out of first available even when her menu is filled in, because the flag says no', async () => {
    const all = servicesSeed.map((s) => serviceSeedId(s.key));
    await staffRepo.updateStaff(iniya, { serviceIds: all }, NOW);
    try {
      const wed = nextDate(3, 5);
      const any = availabilityResponseSchema.parse(
        (await get(`/api/availability?date=${wed}&serviceIds=${haircut}&staff=any`)).body,
      );
      expect(any.slots.some((s) => s.staffId === iniya)).toBe(false);
      const named = availabilityResponseSchema.parse(
        (await get(`/api/availability?date=${wed}&serviceIds=${haircut}&staff=iniya`)).body,
      );
      expect(named.slots).toEqual([]);
    } finally {
      await staffRepo.updateStaff(iniya, { serviceIds: [] }, NOW);
    }
  });

  it('has no next open time and no openings, so her card never says "Off today"', async () => {
    const next = nextOpeningsResponseSchema.parse((await get('/api/availability/next')).body);
    const row = next.chairs.find((c) => c.staff.slug === 'iniya');
    expect(row?.nextOpen).toBeNull();
    expect(row?.serviceId).toBeNull();
    const openings = staffOpeningsResponseSchema.parse(
      (await get('/api/staff/iniya/openings?count=3')).body,
    );
    expect(openings.service).toBeNull();
    expect(openings.openings).toEqual([]);
  });

  it('keeps her page in the sitemap: it is a real page that sends visitors to her Instagram', async () => {
    const xml = String((await get('/api/sitemap.xml')).body.text);
    expect(xml).toContain('<loc>http://localhost:5173/chairs/iniya</loc>');
    for (const slug of ['dontrise', 'lee', 'drew', 'nelly']) {
      expect(xml).toContain(`<loc>http://localhost:5173/chairs/${slug}</loc>`);
    }
    expect(xml).not.toMatch(/marcus|kris|\/chairs\/jay|\/chairs\/tre|\/chairs\/dee/);
  });
});

describe('the Google block in the owner settings', () => {
  async function put(settings: unknown) {
    return call(server.baseUrl, 'PUT', '/api/admin/settings', {
      headers: { cookie: ownerCookie },
      body: settings,
    });
  }
  const current = async () =>
    settingsResponseSchema.parse(
      (
        await call(server.baseUrl, 'GET', '/api/admin/settings', {
          headers: { cookie: ownerCookie },
        })
      ).body,
    ).settings;

  it('round trips, and a change reaches the public shop answer', async () => {
    const settings = await current();
    expect(settings.google).toEqual(shopSettingsSeed.google);
    const res = await put({
      ...settings,
      google: { ...settings.google, rating: 4.8, reviewCount: 16, ratingCheckedOn: '2026-11-02' },
    });
    expect(res.status).toBe(200);
    expect(publicShopSchema.parse((await get('/api/shop')).body).google).toMatchObject({
      rating: 4.8,
      reviewCount: 16,
      ratingCheckedOn: '2026-11-02',
    });
    await put(settings);
  });

  it('rejects a bad rating, count, date or place id, and changes nothing', async () => {
    const settings = await current();
    const google = settings.google;
    for (const bad of [
      { ...google, rating: 6 },
      { ...google, rating: 4.75 },
      { ...google, reviewCount: -1 },
      { ...google, reviewCount: 2.5 },
      { ...google, ratingCheckedOn: 'yesterday' },
      { ...google, placeId: 'bad id with spaces' },
    ]) {
      const res = await put({ ...settings, google: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await current()).google).toEqual(settings.google);
  });

  it('is owner only', async () => {
    const settings = await current();
    const anonymous = await call(server.baseUrl, 'PUT', '/api/admin/settings', { body: settings });
    expect(anonymous.status).toBe(401);
  });

  it('a settings document saved before the field existed reads back with the empty default', async () => {
    await db()
      .collection('shopSettings')
      .updateOne({ _id: 'shop' as never }, { $unset: { google: '' } });
    const settings = await shopSettingsRepo.requireShopSettings();
    expect(settings.google).toEqual({
      placeId: '',
      rating: 0,
      reviewCount: 0,
      ratingCheckedOn: '',
    });
    const shop = publicShopSchema.parse((await get('/api/shop')).body);
    expect(shop.google?.placeId).toBe('');
    await db()
      .collection('shopSettings')
      .updateOne({ _id: 'shop' as never }, { $set: { google: shopSettingsSeed.google } });
  });
});
