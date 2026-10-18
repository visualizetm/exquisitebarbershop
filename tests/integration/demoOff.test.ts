import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../../server/env';
import { systemStateRepo } from '../../server/repos';
import { resetDemoReadyCache } from '../../server/services/demo';
import { runSeed } from '../../server/services/seedService';
import { resetStorageCache } from '../../server/storage';
import { staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import { publicShopSchema } from '../../shared/api/public';
import { createLogin, sessionCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

/**
 * DEMO_MODE off is the real shop. Nothing of the showcase exists: no demo sign-in, no
 * reset, no first-request seeding, no photo storage in MongoDB.
 */
const BOOT = 'test-bootstrap-secret-0123456789abcdef01234';
process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;

const codeOf = (body: unknown) => apiErrorSchema.parse(body).error.code;

beforeAll(async () => {
  server = await startTestServer();
  process.env.DEMO_MODE = 'false';
  process.env.STORAGE_DRIVER = 'local';
  process.env.APP_BASE_URL = server.baseUrl;
  resetEnvCache();
  resetStorageCache();
  resetDemoReadyCache();
});
afterAll(async () => {
  await server.close();
});
afterEach(() => {
  delete process.env.BOOTSTRAP_SECRET;
  resetEnvCache();
});

describe('with DEMO_MODE off', () => {
  it('does not seed an empty database on the first request', async () => {
    const shop = await call(server.baseUrl, 'GET', '/api/shop');
    expect(shop.status).toBe(503);
    expect(codeOf(shop.body)).toBe('CONFIG_ERROR');
    expect(shop.headers.get('x-robots-tag')).toBeNull();
    expect(await db().collection('shopSettings').countDocuments()).toBe(0);
    expect(await db().collection('staff').countDocuments()).toBe(0);
    expect(await db().collection('users').countDocuments()).toBe(0);
    expect(await systemStateRepo.getDemoRecord()).toBeNull();
    expect(await systemStateRepo.getBootstrapRecord()).toBeNull();
  });

  it('has no demo sign-in, no reset and no media routes', async () => {
    await runSeed(db(), NOW);
    const owner = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
    const cookie = await sessionCookie(owner._id);

    const login = await call(server.baseUrl, 'POST', '/api/auth/demo-login', { body: {} });
    expect(login.status).toBe(404);
    expect(codeOf(login.body)).toBe('NOT_FOUND');
    expect(login.headers.get('set-cookie')).toBeNull();
    expect(
      (
        await call(server.baseUrl, 'POST', '/api/admin/demo/reset', {
          headers: { cookie },
          body: {},
        })
      ).status,
    ).toBe(404);
    // The owner's own session is untouched and the shop says it is not a demo.
    const shop = publicShopSchema.parse((await call(server.baseUrl, 'GET', '/api/shop')).body);
    expect(shop.demo).toBe(false);
    const me = await call(server.baseUrl, 'GET', '/api/auth/me', { headers: { cookie } });
    expect((me.body.features as { demo: boolean }).demo).toBe(false);

    const id = '0f8fad5b-d9cb-469f-a165-70867728950e.webp';
    expect((await call(server.baseUrl, 'GET', `/api/media/${id}`)).status).toBe(404);
    const put = await call(server.baseUrl, 'PUT', `/api/media/${id}?k=x&exp=1&sig=x`, { body: {} });
    expect(put.status).toBe(404);
  });

  it('refuses setup on a database the demo filled, until it is cleared', async () => {
    await systemStateRepo.recordDemoSeed(NOW);
    process.env.BOOTSTRAP_SECRET = BOOT;
    resetEnvCache();
    const res = await call(server.baseUrl, 'POST', '/api/internal/bootstrap', {
      headers: { authorization: `Bearer ${BOOT}` },
      body: {},
    });
    expect(res.status).toBe(409);
    expect(apiErrorSchema.parse(res.body).error.message).toContain('demo data');
    await db().collection('systemState').deleteMany({});
  });
});
