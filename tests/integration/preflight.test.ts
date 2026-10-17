import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../../server/env';
import { usersRepo } from '../../server/repos';
import { runSeed } from '../../server/services/seedService';
import { resetStorageCache } from '../../server/storage';
import { apiErrorSchema } from '../../shared/api/errors';
import { createLogin } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

const CRON = 'test-cron-secret-0123456789abcdef0123456789';
const BOOT = 'test-bootstrap-secret-0123456789abcdef01234';
process.env.CRON_SECRET = CRON;
process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
interface Check {
  id: string;
  status: string;
  detail: string;
  fix?: string;
}
const checksOf = (body: Record<string, unknown>) => body.checks as Check[];

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  // The local driver signs upload URLs against APP_BASE_URL; point it at this server.
  process.env.APP_BASE_URL = server.baseUrl;
  process.env.STORAGE_DRIVER = 'local';
  resetEnvCache();
  resetStorageCache();
});
afterAll(async () => {
  await server.close();
});
afterEach(() => {
  delete process.env.BOOTSTRAP_SECRET;
  delete process.env.VERCEL_ENV;
  delete process.env.MAINTENANCE_MODE;
  delete process.env.SEED_OWNER_EMAIL;
  delete process.env.SEED_OWNER_PASSWORD;
  resetEnvCache();
});

describe('the doctor', () => {
  it('runs every check against a healthy test deployment and never returns a value', async () => {
    await createLogin({ role: 'owner', staffId: null });
    const res = await call(server.baseUrl, 'GET', '/api/internal/doctor', {
      headers: bearer(CRON),
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.environment).toBe('test');
    const ids = checksOf(res.body).map((c) => `${c.id}:${c.status}`);
    expect(ids).toEqual([
      'env:pass',
      'db:pass',
      'replica-set:pass',
      'transactions:pass',
      'indexes:pass',
      'seed:pass',
      'owner:pass',
      'storage:pass',
      'storage-public:pass',
      'email:pass',
      'cron:pass',
    ]);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(CRON);
    expect(raw).not.toContain(process.env.MONGODB_URI ?? 'mongodb://');
    expect(raw).not.toContain('test-manage-link-secret');
    // The throwaway objects are gone.
    expect(await db().listCollections({ name: '_doctor' }).toArray()).toEqual([]);
  });

  it('takes the bootstrap secret too, and says what a production deployment is missing', async () => {
    process.env.BOOTSTRAP_SECRET = BOOT;
    process.env.VERCEL_ENV = 'production';
    resetEnvCache();
    const res = await call(server.baseUrl, 'GET', '/api/internal/doctor', {
      headers: bearer(BOOT),
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.environment).toBe('production');
    const failing = checksOf(res.body).filter((c) => c.id.startsWith('env:'));
    expect(failing.map((c) => c.id)).toEqual([
      'env:APP_BASE_URL',
      'env:STORAGE_DRIVER',
      'env:EMAIL_DISABLED_ACK',
    ]);
    expect(failing.every((c) => c.status === 'fail' && (c.fix ?? '').length > 20)).toBe(true);
    // Everything else answers 503 with a pointer to the doctor; the health check still works.
    const shop = await call(server.baseUrl, 'GET', '/api/shop');
    expect(shop.status).toBe(503);
    expect(apiErrorSchema.parse(shop.body).error.code).toBe('CONFIG_ERROR');
    expect((await call(server.baseUrl, 'GET', '/api/health')).status).toBe(200);
  });

  it('refuses a wrong secret and does not exist for a setup secret while BOOTSTRAP_SECRET is unset', async () => {
    // A secret that is not the cron's reads as "no such endpoint" while setup is off.
    const wrong = await call(server.baseUrl, 'GET', '/api/internal/doctor', {
      headers: bearer('x'.repeat(CRON.length)),
    });
    expect(wrong.status).toBe(404);
    const plain = await call(server.baseUrl, 'GET', '/api/internal/outbox/deliver', {
      headers: bearer('x'.repeat(CRON.length)),
    });
    expect(plain.status).toBe(403);
    const none = await call(server.baseUrl, 'GET', '/api/internal/doctor');
    expect(none.status).toBe(403);
    const boot = await call(server.baseUrl, 'POST', '/api/internal/bootstrap', {
      headers: bearer(BOOT),
      body: {},
    });
    expect(boot.status).toBe(404);
    expect((await call(server.baseUrl, 'GET', '/api/setup')).body).toEqual({ enabled: false });
  });
});

describe('bootstrap', () => {
  it('runs once from the browser, creates the owner, refuses a second run unless forced, and audits', async () => {
    await db().collection('users').deleteMany({});
    process.env.BOOTSTRAP_SECRET = BOOT;
    process.env.SEED_OWNER_EMAIL = 'owner@example.com';
    process.env.SEED_OWNER_PASSWORD = 'Vt7pLq9xWz2mRk-chair';
    resetEnvCache();
    expect((await call(server.baseUrl, 'GET', '/api/setup')).body).toEqual({ enabled: true });

    const wrong = await call(server.baseUrl, 'POST', '/api/internal/bootstrap', {
      headers: bearer('y'.repeat(BOOT.length)),
      body: {},
    });
    expect(wrong.status).toBe(403);

    const first = await call(server.baseUrl, 'POST', '/api/internal/bootstrap', {
      headers: bearer(BOOT),
      body: {},
    });
    expect(first.status).toBe(201);
    expect(first.body.firstRun).toBe(true);
    expect(first.body.runs).toBe(1);
    expect((first.body.created as Record<string, unknown>).ownerLogin).toBe('created');
    const owner = await usersRepo.findOwnerUser();
    expect(owner?.email).toBe('owner@example.com');
    expect(JSON.stringify(first.body)).not.toContain('Vt7pLq9xWz2mRk');

    const again = await call(server.baseUrl, 'POST', '/api/internal/bootstrap', {
      headers: bearer(BOOT),
      body: {},
    });
    expect(again.status).toBe(409);

    const forced = await call(server.baseUrl, 'POST', '/api/internal/bootstrap', {
      headers: bearer(BOOT),
      body: { force: true },
    });
    expect(forced.status).toBe(201);
    expect(forced.body.firstRun).toBe(false);
    expect(forced.body.runs).toBe(2);
    expect((forced.body.created as Record<string, unknown>).ownerLogin).toBe('exists');

    const audit = await db()
      .collection<{ action: string }>('auditLog')
      .find({ action: 'system.bootstrap' })
      .toArray();
    expect(audit).toHaveLength(2);
  });
});

describe('maintenance mode', () => {
  it('answers public routes with 503, keeps the shop details, the health check and the staff area', async () => {
    process.env.MAINTENANCE_MODE = 'true';
    resetEnvCache();
    const services = await call(server.baseUrl, 'GET', '/api/services');
    expect(services.status).toBe(503);
    expect(apiErrorSchema.parse(services.body).error.code).toBe('MAINTENANCE');
    const shop = await call(server.baseUrl, 'GET', '/api/shop');
    expect(shop.status).toBe(200);
    expect(shop.body.maintenance).toBe(true);
    expect((await call(server.baseUrl, 'GET', '/api/health')).status).toBe(200);
    expect((await call(server.baseUrl, 'GET', '/api/admin/today')).status).toBe(401);
    expect((await call(server.baseUrl, 'POST', '/api/auth/login', { body: {} })).status).toBe(400);
  });
});
