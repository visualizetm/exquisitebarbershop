import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { shopSettingsSeed, staffSeedId } from '../../seed/shop';
import { auditListResponseSchema, settingsResponseSchema } from '../../shared/api/admin';
import { apiErrorSchema } from '../../shared/api/errors';
import { publicShopSchema } from '../../shared/api/public';
import type { ShopSettingsDocument } from '../../shared/schemas/shopSettings';
import { shopSettingsRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { createLogin, sessionCookie, teamCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
let initial: ShopSettingsDocument;

interface SourceReview {
  name: string;
  text: string;
  stars?: number;
  date?: string;
  barber?: string;
  short?: string;
}
const data = JSON.parse(readFileSync('docs/content/exquisite-site-data.json', 'utf8')) as {
  reviews_for_site: Record<'google' | 'thecut_drew' | 'thecut_nelly', SourceReview[]>;
};
const source = data.reviews_for_site;

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  ownerCookie = await sessionCookie(
    (await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') }))._id,
  );
  initial = await shopSettingsRepo.requireShopSettings();
});
afterAll(async () => {
  await server.close();
});
// Every test starts from the seeded reviews and rating.
beforeEach(async () => {
  await shopSettingsRepo.updateReviewSettings(
    { reviews: initial.reviews, google: initial.google },
    NOW,
  );
});

const owner = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie: ownerCookie },
    ...(body === undefined ? {} : { body }),
  });
const putReviews = (body: unknown) => owner('PUT', '/api/admin/reviews', body);
const settingsNow = async () =>
  settingsResponseSchema.parse((await owner('GET', '/api/admin/settings')).body).settings;
const publicShop = async () =>
  publicShopSchema.parse((await call(server.baseUrl, 'GET', '/api/shop')).body);
const ordered = (items: ShopSettingsDocument['reviews']['items']) =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder);

describe('the seeded reviews', () => {
  it('are the reviews in the data file, word for word, in the order the spec gives', () => {
    const google = source.google.filter((r) => r.name !== 'Wesley T.');
    const homeFirst = ['Unique D.', 'Ricardo E.', 'Routine Life Fitness'];
    const googleOrder = [
      ...homeFirst.map((name) => google.find((r) => r.name === name)),
      ...google.filter((r) => !homeFirst.includes(r.name)),
    ];
    const expected = [
      ...googleOrder.map((r) => ({
        name: r?.name,
        text: r?.short ?? r?.text,
        stars: 5,
        source: 'google',
        date: r?.date,
        staffId: r?.barber === 'Dontrise' ? staffSeedId('dontrise') : null,
      })),
      ...source.thecut_drew.map((r) => ({
        name: r.name,
        text: r.text,
        stars: 5,
        source: 'thecut',
        date: undefined,
        staffId: staffSeedId('drew'),
      })),
      ...source.thecut_nelly.map((r) => ({
        name: r.name,
        text: r.text,
        stars: 5,
        source: 'thecut',
        date: undefined,
        staffId: staffSeedId('nelly'),
      })),
    ];
    const stored = ordered(initial.reviews.items);
    expect(
      stored.map((r) => ({
        name: r.name,
        text: r.text,
        stars: r.stars,
        source: r.source,
        date: r.date,
        staffId: r.staffId,
      })),
    ).toEqual(expected);
    expect(stored).toHaveLength(18);
    expect(initial.reviews.enabled).toBe(true);
    expect(stored.every((r) => r.show)).toBe(true);
    expect(stored.every((r) => /^[0-9a-f]{24}$/.test(r.id))).toBe(true);
    expect(new Set(stored.map((r) => r.id)).size).toBe(18);
  });

  it('leave Wesley T. out entirely, use the short Lamont I. text and give theCut no date', () => {
    const items = initial.reviews.items;
    expect(items.some((r) => r.name === 'Wesley T.')).toBe(false);
    expect(JSON.stringify(items)).not.toContain('the owner was nothing less');
    const lamont = items.find((r) => r.name === 'Lamont I.');
    expect(lamont?.text).toBe(source.google.find((r) => r.name === 'Lamont I.')?.short);
    expect(items.filter((r) => r.source === 'thecut').every((r) => r.date === undefined)).toBe(
      true,
    );
    // Nelly's reviews call him Mike, his real name: kept as written.
    expect(items.find((r) => r.name === 'Paul H.')?.text).toContain('Mike');
  });

  it('a settings document saved before the field existed reads back with no reviews', async () => {
    await db()
      .collection('shopSettings')
      .updateOne({ _id: 'shop' as never }, { $unset: { reviews: '' } });
    const settings = await shopSettingsRepo.requireShopSettings();
    expect(settings.reviews).toEqual({ enabled: true, items: [] });
    expect((await publicShop()).reviews).toEqual([]);
  });
});

describe('the public shop answer', () => {
  it('serves the shown reviews in order, with only what a card prints', async () => {
    const shop = await publicShop();
    expect(shop.reviews?.slice(0, 3).map((r) => r.name)).toEqual([
      'Unique D.',
      'Ricardo E.',
      'Routine Life Fitness',
    ]);
    expect(shop.reviews).toHaveLength(18);
    expect(shop.reviews?.[0]).toEqual({
      id: ordered(initial.reviews.items)[0]?.id,
      name: 'Unique D.',
      text: source.google[0]?.text,
      stars: 5,
      source: 'google',
      date: '2025-11-25',
      staffId: null,
    });
    expect(shop.reviews?.find((r) => r.source === 'thecut')?.date).toBeNull();
    const raw = (await call(server.baseUrl, 'GET', '/api/shop')).body as {
      reviews: Record<string, unknown>[];
    };
    expect(Object.keys(raw.reviews[0] ?? {}).sort()).toEqual(
      ['date', 'id', 'name', 'source', 'stars', 'staffId', 'text'].sort(),
    );
    expect(shop.google).toEqual(shopSettingsSeed.google);
  });

  it('never sends a hidden review, and sends none while the section is off', async () => {
    const items = ordered(initial.reviews.items);
    const hidden = items[1];
    const res = await putReviews({
      items: items.map((r) => ({ id: r.id, show: r.id !== hidden?.id })),
    });
    expect(res.status).toBe(200);
    const shop = await publicShop();
    expect(shop.reviews).toHaveLength(17);
    expect(shop.reviews?.some((r) => r.id === hidden?.id)).toBe(false);
    expect(JSON.stringify(shop)).not.toContain(hidden?.text ?? 'missing');

    expect((await putReviews({ enabled: false })).status).toBe(200);
    expect((await publicShop()).reviews).toEqual([]);
    expect(JSON.stringify(await publicShop())).not.toContain('Unique D.');
  });

  it('lists the reviews about a chair with that chair id, for its page', async () => {
    const shop = await publicShop();
    const about = (key: string) =>
      (shop.reviews ?? []).filter((r) => r.staffId === staffSeedId(key)).map((r) => r.name);
    expect(about('dontrise')).toEqual(['Routine Life Fitness', 'Daniel M.', 'Lamont I.']);
    expect(about('drew')).toEqual(['Tom R.', 'Alexis M.', 'Mark G.', 'Jourdan S.', 'Mike R.']);
    expect(about('nelly')).toEqual(['Paul H.', 'Christian T.', 'Dylan M.', 'Jesse W.']);
    expect(about('lee')).toEqual([]);
    expect(about('iniya')).toEqual([]);
  });
});

describe('PUT /api/admin/reviews', () => {
  it('shows, hides and reorders, keeping every quote as it is', async () => {
    const items = ordered(initial.reviews.items);
    const reversed = [...items].reverse();
    const res = await putReviews({
      items: reversed.map((r, i) => ({ id: r.id, show: i !== 0 })),
    });
    expect(res.status).toBe(200);
    const saved = settingsResponseSchema.parse(res.body).settings.reviews;
    const after = ordered(saved.items);
    expect(after.map((r) => r.id)).toEqual(reversed.map((r) => r.id));
    expect(after.map((r) => r.sortOrder)).toEqual(after.map((_r, i) => i * 10));
    expect(after[0]?.show).toBe(false);
    expect(after.slice(1).every((r) => r.show)).toBe(true);
    // Names, quotes, stars, sources, dates and chairs are untouched.
    const strip = (r: (typeof items)[number]) => ({ ...r, show: true, sortOrder: 0 });
    expect([...after].map(strip).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...items].map(strip).sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect((await publicShop()).reviews?.[0]?.name).toBe(reversed[1]?.name);
  });

  it('saves the Google rating, count and date, and keeps the place id', async () => {
    const res = await putReviews({
      google: { rating: 4.8, reviewCount: 16, ratingCheckedOn: '2026-11-02' },
    });
    expect(res.status).toBe(200);
    expect((await settingsNow()).google).toEqual({
      placeId: shopSettingsSeed.google?.placeId,
      rating: 4.8,
      reviewCount: 16,
      ratingCheckedOn: '2026-11-02',
    });
    expect((await publicShop()).google?.rating).toBe(4.8);
    // The review list and the switch were not part of that save, so they stay as they were.
    expect((await settingsNow()).reviews).toEqual(initial.reviews);
  });

  it('switches the whole section off and on', async () => {
    expect((await putReviews({ enabled: false })).status).toBe(200);
    expect((await settingsNow()).reviews.enabled).toBe(false);
    expect((await settingsNow()).reviews.items).toEqual(initial.reviews.items);
    expect((await putReviews({ enabled: true })).status).toBe(200);
    expect((await publicShop()).reviews).toHaveLength(18);
  });

  it('refuses bad input with the standard error and changes nothing', async () => {
    const items = ordered(initial.reviews.items);
    const list = items.map((r) => ({ id: r.id, show: r.show }));
    const cases: [unknown, number, string][] = [
      [{}, 400, 'VALIDATION_ERROR'],
      // A request can never carry a quote, a name or stars, and never adds a review.
      [{ items: list.map((r, i) => (i === 0 ? { ...r, text: 'Best shop ever' } : r)) }, 400, ''],
      [{ items: list.map((r, i) => (i === 0 ? { ...r, stars: 1 } : r)) }, 400, ''],
      [{ items: list, add: { name: 'Fake F.', text: 'Made up' } }, 400, ''],
      [{ items: [...list, list[0]] }, 400, ''],
      [{ items: list.map((r) => ({ ...r, show: 'yes' })) }, 400, ''],
      [{ items: [...list.slice(1), { id: 'f'.repeat(24), show: true }] }, 409, 'CONFLICT'],
      [{ items: list.slice(1) }, 409, 'CONFLICT'],
      [{ google: { rating: 6, reviewCount: 15, ratingCheckedOn: '' } }, 400, ''],
      [{ google: { rating: 4.75, reviewCount: 15, ratingCheckedOn: '' } }, 400, ''],
      [{ google: { rating: 0, reviewCount: 15, ratingCheckedOn: '' } }, 400, ''],
      [{ google: { rating: 4.7, reviewCount: -1, ratingCheckedOn: '' } }, 400, ''],
      [{ google: { rating: 4.7, reviewCount: 15, ratingCheckedOn: 'yesterday' } }, 400, ''],
      [{ google: { placeId: 'x', rating: 4.7, reviewCount: 15, ratingCheckedOn: '' } }, 400, ''],
      [{ enabled: 'no' }, 400, ''],
    ];
    for (const [body, status, code] of cases) {
      const res = await putReviews(body);
      expect(res.status, JSON.stringify(body)).toBe(status);
      const error = apiErrorSchema.parse(res.body).error;
      expect(error.code, JSON.stringify(body)).toBe(code || 'VALIDATION_ERROR');
    }
    const now = await settingsNow();
    expect(now.reviews).toEqual(initial.reviews);
    expect(now.google).toEqual(initial.google);
  });

  it('is owner only: anonymous and a barber are refused, and nothing changes', async () => {
    const body = { enabled: false };
    const anonymous = await call(server.baseUrl, 'PUT', '/api/admin/reviews', { body });
    expect(anonymous.status).toBe(401);
    const barber = await call(server.baseUrl, 'PUT', '/api/admin/reviews', {
      body,
      headers: { cookie: await teamCookie(staffSeedId('drew')) },
    });
    expect(barber.status).toBe(401);
    expect((await settingsNow()).reviews.enabled).toBe(true);
  });

  it('writes an audit entry with the switch, the rating and each review place, before and after', async () => {
    const items = ordered(initial.reviews.items);
    const target = items[2];
    await putReviews({ items: items.map((r) => ({ id: r.id, show: r.id !== target?.id })) });
    const audit = auditListResponseSchema.parse(
      (await owner('GET', '/api/admin/audit?action=settings.reviews.update&limit=1')).body,
    );
    const entry = audit.entries[0];
    expect(entry).toMatchObject({
      action: 'settings.reviews.update',
      entityType: 'shopSettings',
      entityId: 'shop',
      actor: { type: 'owner' },
    });
    const before = entry?.before as { enabled: boolean; items: { id: string; show: boolean }[] };
    const after = entry?.after as typeof before;
    expect(before.enabled).toBe(true);
    expect(before.items.find((r) => r.id === target?.id)?.show).toBe(true);
    expect(after.items.find((r) => r.id === target?.id)).toMatchObject({
      name: target?.name,
      show: false,
    });
    expect(after).toMatchObject({ google: { rating: 4.7, reviewCount: 15 } });
  });
});

describe('the general settings save and the reviews', () => {
  it('a save that leaves the reviews out keeps them', async () => {
    await putReviews({ enabled: false });
    const { reviews: _reviews, ...withoutReviews } = await settingsNow();
    const res = await owner('PUT', '/api/admin/settings', withoutReviews);
    expect(res.status).toBe(200);
    const after = await settingsNow();
    expect(after.reviews.enabled).toBe(false);
    expect(after.reviews.items).toEqual(initial.reviews.items);
  });

  it('a save that carries the reviews never changes them, so a quote cannot be typed in', async () => {
    const settings = await settingsNow();
    const res = await owner('PUT', '/api/admin/settings', {
      ...settings,
      reviews: {
        enabled: false,
        items: settings.reviews.items.map((r, i) =>
          i === 0 ? { ...r, text: 'Best shop in the world', show: false } : r,
        ),
      },
    });
    expect(res.status).toBe(200);
    const after = await settingsNow();
    expect(after.reviews).toEqual(initial.reviews);
    expect(JSON.stringify(await publicShop())).not.toContain('Best shop in the world');
  });
});
