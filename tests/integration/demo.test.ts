import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../../server/env';
import { COLLECTIONS } from '../../server/db/indexes';
import { systemStateRepo, usersRepo } from '../../server/repos';
import { resetDemoReadyCache } from '../../server/services/demo';
import { resetStorageCache } from '../../server/storage';
import { MONGO_MAX_BYTES } from '../../server/storage/mongo';
import { apiErrorSchema } from '../../shared/api/errors';
import { meResponseSchema } from '../../shared/api/auth';
import { adminPhotoResponseSchema, uploadUrlResponseSchema } from '../../shared/api/photos';
import { publicShopSchema, publicStaffListResponseSchema } from '../../shared/api/public';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { useTestDb } from '../helpers/db';

/**
 * Showcase mode on an empty database: no seed script, no setup page. The first request sets
 * everything up, the demo sign-in opens the owner dashboard, photos live in GridFS.
 */
const CRON = 'test-cron-secret-0123456789abcdef0123456789';
process.env.CRON_SECRET = CRON;
process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const codeOf = (body: unknown) => apiErrorSchema.parse(body).error.code;
/** A tiny valid WebP header followed by filler; the server checks the magic bytes and the size. */
const webp = (size = 400) => Buffer.concat([Buffer.from('RIFF....WEBPVP8 '), Buffer.alloc(size)]);

function demoEnv(on: boolean) {
  process.env.DEMO_MODE = on ? 'true' : 'false';
  process.env.STORAGE_DRIVER = on ? 'mongo' : 'local';
  process.env.APP_BASE_URL = server.baseUrl;
  resetEnvCache();
  resetStorageCache();
  resetDemoReadyCache();
}

async function wipeEverything() {
  for (const name of Object.values(COLLECTIONS)) await db().collection(name).deleteMany({});
  await db().collection('media.files').deleteMany({});
  await db().collection('media.chunks').deleteMany({});
  resetDemoReadyCache();
}

/** Signs in through the demo button's endpoint and returns the cookie header for later calls. */
async function demoSignIn(): Promise<string> {
  const res = await call(server.baseUrl, 'POST', '/api/auth/demo-login', { body: {} });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(/^__Host-exq_session=/);
  return cookie;
}

beforeAll(async () => {
  server = await startTestServer();
  process.env.LOG_LEVEL = 'warn';
  demoEnv(true);
});
afterAll(async () => {
  process.env.DEMO_MODE = 'false';
  process.env.STORAGE_DRIVER = 'local';
  resetEnvCache();
  resetStorageCache();
  await server.close();
});
afterEach(() => {
  demoEnv(true);
});

describe('auto setup on an empty database', () => {
  it('seeds the shop, the owner and the sample bookings on the first request', async () => {
    await wipeEverything();
    expect(await db().collection('shopSettings').countDocuments()).toBe(0);

    const shop = await call(server.baseUrl, 'GET', '/api/shop');
    expect(shop.status).toBe(200);
    expect(publicShopSchema.parse(shop.body).demo).toBe(true);
    expect(shop.headers.get('x-robots-tag')).toBe('noindex, nofollow');

    const staff = publicStaffListResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/staff')).body,
    ).staff;
    expect(staff.map((s) => s.slug).sort()).toEqual([
      'dee',
      'dontrise',
      'jay',
      'kris',
      'marcus',
      'tre',
    ]);
    expect((await call(server.baseUrl, 'GET', '/api/services')).status).toBe(200);
    expect(await usersRepo.findOwnerUser()).not.toBeNull();

    // Sample bookings and walk-ins went through the real booking code: slot locks and all.
    const bookings = await db().collection('bookings').find({}).toArray();
    expect(bookings.length).toBeGreaterThanOrEqual(5);
    for (const b of bookings) {
      const customer = b.customer as { name: string; phone: string; email: string | null };
      expect(customer.phone).toMatch(/^\+1215555010\d$/);
      expect(customer.email).toBeNull();
    }
    const locks = await db().collection('slotLocks').countDocuments();
    expect(locks).toBeGreaterThan(bookings.length);
    expect(new Set(bookings.map((b) => b.source as string))).toContain('online');
    expect((await systemStateRepo.getDemoRecord())?.runs).toBe(1);
  });

  it('seeds exactly once when several cold starts arrive together', async () => {
    await wipeEverything();
    const replies = await Promise.all(
      Array.from({ length: 8 }, () => call(server.baseUrl, 'GET', '/api/staff')),
    );
    expect(replies.every((r) => r.status === 200)).toBe(true);
    expect((await systemStateRepo.getBootstrapRecord())?.runs).toBe(1);
    expect((await systemStateRepo.getDemoRecord())?.runs).toBe(1);
    expect(await db().collection('staff').countDocuments()).toBe(6);
    expect(await db().collection('services').countDocuments()).toBe(13);
    expect(await db().collection('users').countDocuments({ role: 'owner' })).toBe(1);
    // The lock is released, and a fresh request finds the shop ready without seeding again.
    expect(
      await db()
        .collection('systemState')
        .countDocuments({ _id: 'demoLock' as never }),
    ).toBe(0);
    resetDemoReadyCache();
    expect((await call(server.baseUrl, 'GET', '/api/shop')).status).toBe(200);
    expect((await systemStateRepo.getBootstrapRecord())?.runs).toBe(1);
  });

  it('takes over a lock that a crashed cold start left behind', async () => {
    await wipeEverything();
    await db()
      .collection('systemState')
      .insertOne({
        _id: 'demoLock' as never,
        lockedAt: new Date(Date.now() - 5 * 60_000),
        holder: 'dead',
      });
    const res = await call(server.baseUrl, 'GET', '/api/shop');
    expect(res.status).toBe(200);
    expect((await systemStateRepo.getBootstrapRecord())?.runs).toBe(1);
  });
});

describe('the demo owner login', () => {
  it('opens the owner dashboard with a normal session and sample bookings', async () => {
    const cookie = await demoSignIn();
    const me = await call(server.baseUrl, 'GET', '/api/auth/me', { headers: { cookie } });
    const parsed = meResponseSchema.parse(me.body);
    expect(parsed.user.role).toBe('owner');
    expect(parsed.features).toEqual({ photos: true, demo: true });
    const today = await call(server.baseUrl, 'GET', '/api/admin/today', { headers: { cookie } });
    expect(today.status).toBe(200);
    const bookings = await call(server.baseUrl, 'GET', '/api/admin/bookings', {
      headers: { cookie },
    });
    expect(bookings.status).toBe(200);
    expect((bookings.body.bookings as unknown[]).length).toBeGreaterThanOrEqual(5);
    // Destructive owner actions keep working: the point of the showcase.
    const created = await call(server.baseUrl, 'POST', '/api/admin/services', {
      headers: { cookie },
      body: {
        name: 'Scratch Service',
        group: 'Barber',
        description: 'Temporary',
        priceCents: 1000,
        priceFrom: false,
        durationMinutes: 15,
        bufferMinutes: null,
        sortOrder: 99,
        isActive: true,
      },
    });
    expect(created.status).toBe(201);
  });
});

describe('photos in MongoDB (GridFS)', () => {
  async function uploadHero(cookie: string, bytes: Buffer, alt = 'The shop floor') {
    const issued = await call(server.baseUrl, 'POST', '/api/admin/photos/upload-url', {
      headers: { cookie },
      body: { kind: 'hero', contentType: 'image/webp', size: bytes.length },
    });
    expect(issued.status).toBe(200);
    const upload = uploadUrlResponseSchema.parse(issued.body);
    const put = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': upload.headers['Content-Type'] ?? '', origin: server.baseUrl },
      body: bytes,
    });
    expect(put.status).toBe(200);
    const confirmed = await call(server.baseUrl, 'POST', '/api/admin/photos/confirm', {
      headers: { cookie },
      body: { ticket: upload.ticket, width: 1600, height: 900, alt },
    });
    expect(confirmed.status).toBe(201);
    return { upload, photo: adminPhotoResponseSchema.parse(confirmed.body).photo };
  }

  it('uploads, serves with long cache headers, and removes', async () => {
    const cookie = await demoSignIn();
    const bytes = webp();
    const { photo } = await uploadHero(cookie, bytes);
    expect(photo.url).toMatch(/\/api\/media\/[0-9a-f-]{36}\.webp$/);

    const shop = publicShopSchema.parse((await call(server.baseUrl, 'GET', '/api/shop')).body);
    expect(shop.heroPhoto?.url).toBe(photo.url);

    const media = await fetch(photo.url);
    expect(media.status).toBe(200);
    expect(media.headers.get('content-type')).toBe('image/webp');
    expect(media.headers.get('cache-control')).toContain('max-age=31536000');
    expect(media.headers.get('cache-control')).toContain('immutable');
    expect(media.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await media.arrayBuffer()).equals(bytes)).toBe(true);

    // The owner removes it; the daily job purges the object and the address stops answering.
    expect(
      (
        await call(server.baseUrl, 'DELETE', `/api/admin/photos/${photo.id}`, {
          headers: { cookie },
        })
      ).status,
    ).toBe(200);
    const cron = await call(server.baseUrl, 'GET', '/api/internal/cron/daily', {
      headers: bearer(CRON),
    });
    expect(cron.status).toBe(200);
    expect(cron.body.photosPurged).toBe(1);
    expect((await fetch(photo.url)).status).toBe(404);
  });

  it('refuses anything over 3 MB, bad signatures, and bytes that are not an image', async () => {
    const cookie = await demoSignIn();
    const tooBig = await call(server.baseUrl, 'POST', '/api/admin/photos/upload-url', {
      headers: { cookie },
      body: { kind: 'hero', contentType: 'image/webp', size: MONGO_MAX_BYTES + 1 },
    });
    expect(tooBig.status).toBe(413);
    expect(codeOf(tooBig.body)).toBe('PAYLOAD_TOO_LARGE');

    const issued = uploadUrlResponseSchema.parse(
      (
        await call(server.baseUrl, 'POST', '/api/admin/photos/upload-url', {
          headers: { cookie },
          body: { kind: 'hero', contentType: 'image/webp', size: 500 },
        })
      ).body,
    );
    const headers = { 'content-type': 'application/octet-stream', origin: server.baseUrl };
    const forged = new URL(issued.uploadUrl);
    forged.searchParams.set('sig', 'x'.repeat(43));
    expect((await fetch(forged, { method: 'PUT', headers, body: webp() })).status).toBe(403);
    expect(
      (
        await fetch(issued.uploadUrl, {
          method: 'PUT',
          headers,
          body: Buffer.from('<html>not an image</html>'),
        })
      ).status,
    ).toBe(415);
    const huge = await fetch(issued.uploadUrl, {
      method: 'PUT',
      headers,
      body: Buffer.concat([Buffer.from('RIFF....WEBP'), Buffer.alloc(MONGO_MAX_BYTES)]),
    });
    expect(huge.status).toBe(413);
    // Nothing was stored for any of them.
    expect(await db().collection('media.files').countDocuments()).toBe(0);
  });

  it('skips the backup in the daily job and says so in the doctor', async () => {
    const cron = await call(server.baseUrl, 'GET', '/api/internal/cron/daily', {
      headers: bearer(CRON),
    });
    expect(cron.status).toBe(200);
    expect(cron.body.backup).toBeNull();
    expect(cron.body.skipped).toEqual(['backup', 'backupsPruned']);
    const doctor = await call(server.baseUrl, 'GET', '/api/internal/doctor', {
      headers: bearer(CRON),
    });
    const checks = doctor.body.checks as { id: string; status: string }[];
    const status = (id: string) => checks.find((c) => c.id === id)?.status;
    expect(status('storage')).toBe('pass');
    expect(status('storage-public')).toBe('pass');
    expect(status('backups')).toBe('warn');
  });
});

describe('reset and clear', () => {
  it('Reset demo data wipes changes and photos, reloads the sample data, and keeps the owner signed in', async () => {
    const cookie = await demoSignIn();
    const created = await call(server.baseUrl, 'POST', '/api/admin/services', {
      headers: { cookie },
      body: {
        name: 'Scratch Service',
        group: 'Barber',
        description: 'Temporary',
        priceCents: 1000,
        priceFrom: false,
        durationMinutes: 15,
        bufferMinutes: null,
        sortOrder: 99,
        isActive: true,
      },
    });
    expect(created.status).toBe(201);
    const issued = uploadUrlResponseSchema.parse(
      (
        await call(server.baseUrl, 'POST', '/api/admin/photos/upload-url', {
          headers: { cookie },
          body: { kind: 'gallery', contentType: 'image/webp', size: 500 },
        })
      ).body,
    );
    await fetch(issued.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream', origin: server.baseUrl },
      body: webp(),
    });
    expect(await db().collection('media.files').countDocuments()).toBe(1);
    const before = await systemStateRepo.getDemoRecord();

    const reset = await call(server.baseUrl, 'POST', '/api/admin/demo/reset', {
      headers: { cookie },
      body: {},
    });
    expect(reset.status).toBe(200);

    expect(await db().collection('services').countDocuments()).toBe(13);
    expect(await db().collection('media.files').countDocuments()).toBe(0);
    expect(await db().collection('photos').countDocuments()).toBe(0);
    expect(await db().collection('bookings').countDocuments()).toBeGreaterThanOrEqual(5);
    expect((await systemStateRepo.getDemoRecord())?.runs).toBe((before?.runs ?? 0) + 1);
    // Still signed in as the same owner.
    const me = await call(server.baseUrl, 'GET', '/api/auth/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await db().collection('users').countDocuments({ role: 'owner' })).toBe(1);
  });

  it('clears a demo database completely, and only a demo database', async () => {
    const clear = await call(server.baseUrl, 'POST', '/api/internal/demo/clear', {
      headers: bearer(CRON),
      body: {},
    });
    expect(clear.status).toBe(200);
    expect(clear.body.cleared).toBe(true);
    for (const name of Object.values(COLLECTIONS)) {
      expect(await db().collection(name).countDocuments(), name).toBe(0);
    }
    // No marker, no wipe: a database that is not the demo's is refused (demo mode off, so it
    // does not seed itself again either).
    demoEnv(false);
    await db()
      .collection('shopSettings')
      .insertOne({ _id: 'keep' as never });
    const refused = await call(server.baseUrl, 'POST', '/api/internal/demo/clear', {
      headers: bearer(CRON),
      body: {},
    });
    expect(refused.status).toBe(409);
    expect(await db().collection('shopSettings').countDocuments()).toBe(1);
    await db().collection('shopSettings').deleteMany({});
  });
});
