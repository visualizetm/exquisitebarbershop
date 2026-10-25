import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../../server/env';
import { runSeed } from '../../server/services/seedService';
import { resetStorageCache } from '../../server/storage';
import { meResponseSchema } from '../../shared/api/auth';
import { apiErrorSchema } from '../../shared/api/errors';
import { healthResponseSchema } from '../../shared/api/health';
import { adminPhotoListResponseSchema, galleryResponseSchema } from '../../shared/api/photos';
import { publicShopSchema, publicStaffListResponseSchema } from '../../shared/api/public';
import { staffSeedId } from '../../seed/shop';
import { createLogin, sessionCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

/**
 * STORAGE_DRIVER=none: the site runs without photos until R2 exists. Uploads
 * answer 503 STORAGE_DISABLED, every read shows no photo, the daily job skips
 * the storage steps, and the doctor warns instead of failing.
 */
const CRON = 'test-cron-secret-0123456789abcdef0123456789';
process.env.CRON_SECRET = CRON;
process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const owner = (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie: ownerCookie },
    ...(body === undefined ? {} : { body }),
  });
const codeOf = (body: unknown) => apiErrorSchema.parse(body).error.code;

beforeAll(async () => {
  await runSeed(db(), NOW);
  server = await startTestServer();
  const user = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  ownerCookie = await sessionCookie(user._id);
  process.env.STORAGE_DRIVER = 'none';
  resetEnvCache();
  resetStorageCache();
});
afterAll(async () => {
  process.env.STORAGE_DRIVER = 'local';
  resetEnvCache();
  resetStorageCache();
  await server.close();
});
afterEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.STORAGE_DISABLED_ACK;
  delete process.env.EMAIL_DISABLED_ACK;
  process.env.STORAGE_DRIVER = 'none';
  resetEnvCache();
});

describe('without photo storage', () => {
  it('answers every upload route with 503 STORAGE_DISABLED and lists no photos', async () => {
    const issued = await owner('POST', '/api/admin/photos/upload-url', {
      kind: 'hero',
      contentType: 'image/webp',
      size: 1000,
    });
    expect(issued.status).toBe(503);
    expect(codeOf(issued.body)).toBe('STORAGE_DISABLED');
    expect(apiErrorSchema.parse(issued.body).error.message).toContain('not set up yet');
    const confirmed = await owner('POST', '/api/admin/photos/confirm', {
      ticket: 'u1.not-a-real-ticket.0123456789abcdef',
      width: 10,
      height: 10,
      alt: 'x',
    });
    expect(confirmed.status).toBe(503);
    expect(codeOf(confirmed.body)).toBe('STORAGE_DISABLED');
    const list = await owner('GET', '/api/admin/photos?kind=hero');
    expect(list.status).toBe(200);
    expect(adminPhotoListResponseSchema.parse(list.body).photos).toEqual([]);
    const me = await owner('GET', '/api/auth/me');
    expect(meResponseSchema.parse(me.body).features).toEqual({
      photos: false,
      demo: false,
      email: false,
    });
  });

  it('renders the public pages with placeholders: no hero, no portraits, an empty gallery', async () => {
    const shop = await call(server.baseUrl, 'GET', '/api/shop');
    expect(shop.status).toBe(200);
    expect(publicShopSchema.parse(shop.body).heroPhoto).toBeNull();
    const staff = await call(server.baseUrl, 'GET', '/api/staff');
    expect(staff.status).toBe(200);
    const list = publicStaffListResponseSchema.parse(staff.body).staff;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.photo === null || s.photo === undefined)).toBe(true);
    const gallery = await call(server.baseUrl, 'GET', '/api/gallery');
    expect(gallery.status).toBe(200);
    const page = galleryResponseSchema.parse(gallery.body);
    expect(page.photos).toEqual([]);
    expect(page.counts).toEqual([]);
    expect(page.total).toBe(0);
    // A chair that does not exist is still a 404, not an empty page.
    expect((await call(server.baseUrl, 'GET', '/api/gallery?staff=nobody')).status).toBe(404);
  });

  it('runs the daily job with only the outbox and says which steps were skipped', async () => {
    const res = await call(server.baseUrl, 'GET', '/api/internal/cron/daily', {
      headers: bearer(CRON),
    });
    expect(res.status).toBe(200);
    expect(res.body.backup).toBeNull();
    expect(res.body.photosPurged).toBe(0);
    expect(res.body.skipped).toEqual(['photosPurged', 'uploadsSwept', 'backup', 'backupsPruned']);
    expect(res.body.outbox).toBeTruthy();
    const deliver = await call(server.baseUrl, 'GET', '/api/internal/outbox/deliver', {
      headers: bearer(CRON),
    });
    expect(deliver.status).toBe(200);
  });

  it('warns in the doctor for storage, the public URL and backups, with the R2 fix', async () => {
    const res = await call(server.baseUrl, 'GET', '/api/internal/doctor', {
      headers: bearer(CRON),
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const checks = res.body.checks as { id: string; status: string; fix?: string }[];
    const byId = new Map(checks.map((c) => [c.id, c]));
    for (const id of ['storage', 'storage-public', 'backups']) {
      expect(byId.get(id)?.status, id).toBe('warn');
      expect(byId.get(id)?.fix, id).toBe(
        'Set up Cloudflare R2 (see DEPLOY.md) to turn on photos and daily backups.',
      );
    }
    expect(byId.get('env')?.status).toBe('pass');
  });

  it('is refused in production until STORAGE_DISABLED_ACK=true, and the health check names it', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.EMAIL_DISABLED_ACK = 'true';
    process.env.APP_BASE_URL = 'https://example.com';
    resetEnvCache();
    const health = await call(server.baseUrl, 'GET', '/api/health');
    expect(health.status).toBe(503);
    const body = healthResponseSchema.parse(health.body);
    expect(body.ok).toBe(false);
    expect(body.status).toBe('config');
    expect(body.missing).toEqual(['STORAGE_DISABLED_ACK']);
    expect(body.db).toBeUndefined();
    const shop = await call(server.baseUrl, 'GET', '/api/shop');
    expect(shop.status).toBe(503);
    expect(codeOf(shop.body)).toBe('CONFIG_ERROR');

    process.env.STORAGE_DISABLED_ACK = 'true';
    resetEnvCache();
    const ok = await call(server.baseUrl, 'GET', '/api/health');
    expect(ok.status).toBe(200);
    expect(healthResponseSchema.parse(ok.body).ok).toBe(true);
    expect((await call(server.baseUrl, 'GET', '/api/shop')).status).toBe(200);
    process.env.APP_BASE_URL = server.baseUrl;
  });

  it('still answers the health check, the setup status and the doctor while MONGODB_URI is missing', async () => {
    const uri = process.env.MONGODB_URI ?? '';
    delete process.env.MONGODB_URI;
    process.env.BOOTSTRAP_SECRET = 'test-bootstrap-secret-0123456789abcdef01234';
    resetEnvCache();
    try {
      const health = await call(server.baseUrl, 'GET', '/api/health');
      expect(health.status).toBe(503);
      expect(healthResponseSchema.parse(health.body).missing).toEqual(['MONGODB_URI']);
      expect(JSON.stringify(health.body)).not.toContain('mongodb://');
      expect((await call(server.baseUrl, 'GET', '/api/setup')).body).toEqual({ enabled: true });
      const doctor = await call(server.baseUrl, 'GET', '/api/internal/doctor', {
        headers: bearer(process.env.BOOTSTRAP_SECRET),
      });
      expect(doctor.status).toBe(200);
      expect(doctor.body.ok).toBe(false);
      const checks = doctor.body.checks as { id: string; status: string }[];
      expect(checks.find((c) => c.id === 'env:MONGODB_URI')?.status).toBe('fail');
      expect(checks.find((c) => c.id === 'db')?.status).toBe('fail');
      expect(checks.find((c) => c.id === 'cron')?.status).toBe('pass');
      expect(JSON.stringify(doctor.body)).not.toContain(uri);
    } finally {
      process.env.MONGODB_URI = uri;
      delete process.env.BOOTSTRAP_SECRET;
      resetEnvCache();
    }
  });
});
