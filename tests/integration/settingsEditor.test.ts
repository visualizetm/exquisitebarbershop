import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '../../server/services/seedService';
import { staffSeedId } from '../../seed/shop';
import { settingsResponseSchema } from '../../shared/api/admin';
import { apiErrorSchema } from '../../shared/api/errors';
import { publicShopSchema } from '../../shared/api/public';
import { createLogin, sessionCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();
let server: TestServer;
let cookie: string;
const owner = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie },
    ...(body === undefined ? {} : { body }),
  });

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  const login = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  cookie = await sessionCookie(login._id);
});
afterAll(async () => {
  await server.close();
});

describe('the website editor settings', () => {
  it('validates the hero copy, publishes it to /api/shop, and refuses a save from a stale tab', async () => {
    const loaded = settingsResponseSchema.parse((await owner('GET', '/api/admin/settings')).body);
    expect(loaded.settings.hero.redWord).toBe('Exquisite');
    expect(loaded.updatedAt).toMatch(/T/);

    const bad = await owner('PUT', '/api/admin/settings', {
      ...loaded.settings,
      hero: {
        headline: 'Sharp fades, clean lines.',
        redWord: 'Exquisite',
        subline: 'Book in a minute.',
      },
    });
    expect(bad.status).toBe(400);
    expect(apiErrorSchema.parse(bad.body).error.code).toBe('VALIDATION_ERROR');
    const long = await owner('PUT', '/api/admin/settings', {
      ...loaded.settings,
      hero: {
        headline: 'A headline that is far too long to fit the hero at all',
        redWord: 'hero',
        subline: 'x',
      },
    });
    expect(long.status).toBe(400);

    const saved = await owner('PUT', '/api/admin/settings', {
      ...loaded.settings,
      hero: {
        headline: 'Sharp fades, clean lines.',
        redWord: 'clean',
        subline: 'Book in a minute.',
      },
      expectedUpdatedAt: loaded.updatedAt,
    });
    expect(saved.status).toBe(200);
    const after = settingsResponseSchema.parse(saved.body);
    expect(after.settings.hero.redWord).toBe('clean');
    expect(after.updatedAt).not.toBe(loaded.updatedAt);

    const pub = publicShopSchema.parse((await owner('GET', '/api/shop')).body);
    expect(pub.hero).toEqual({
      headline: 'Sharp fades, clean lines.',
      redWord: 'clean',
      subline: 'Book in a minute.',
    });

    // The other tab still holds the old updatedAt: its save is refused and nothing changes.
    const stale = await owner('PUT', '/api/admin/settings', {
      ...loaded.settings,
      hero: { headline: 'Old tab wins?', redWord: 'tab', subline: 'No.' },
      expectedUpdatedAt: loaded.updatedAt,
    });
    expect(stale.status).toBe(409);
    expect(apiErrorSchema.parse(stale.body).error.message).toBe('Changed somewhere else, reload');
    const still = settingsResponseSchema.parse((await owner('GET', '/api/admin/settings')).body);
    expect(still.settings.hero.redWord).toBe('clean');
    const audit = await db().collection('auditLog').countDocuments({ action: 'settings.update' });
    expect(audit).toBe(1);
  });
});
