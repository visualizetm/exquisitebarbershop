import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../../server/env';
import { shopSettingsRepo } from '../../server/repos';
import { purgeDeletedPhotos, sweepStorageOrphans } from '../../server/services/photosService';
import { runDoctor } from '../../server/services/doctor';
import { runSeed } from '../../server/services/seedService';
import { resetStorageCache } from '../../server/storage';
import { ORPHAN_AGE_MS, signParams } from '../../server/storage/cloudinary';
import { shopSettingsSeed, staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import {
  adminPhotoResponseSchema,
  galleryResponseSchema,
  uploadUrlResponseSchema,
  type UploadUrlResponse,
} from '../../shared/api/photos';
import { publicShopSchema } from '../../shared/api/public';
import { photoKeySchema } from '../../shared/schemas/photo';
import { createLogin, sessionCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';
import { installFakeCloudinary, type FakeCloudinary } from '../helpers/fakeCloudinary';

const CLOUD = 'demo-cloud';
const KEY = '123456789012345';
const SECRET = 'cloudinary-test-api-secret-value';
const FOLDER = 'exquisite/test';

const { db } = useTestDb();
let server: TestServer;
let fake: FakeCloudinary;
let ownerCookie: string;
let marcusCookie: string;
const marcus = staffSeedId('marcus');
const dee = staffSeedId('dee');
const BYTES = Buffer.from('RIFF....WEBPVP8 ' + 'x'.repeat(300));

const as = (cookie: string) => (method: string, path: string, body?: unknown) =>
  call(server.baseUrl, method, path, {
    headers: { cookie },
    ...(body === undefined ? {} : { body }),
  });
const codeOf = (body: unknown) => apiErrorSchema.parse(body).error.code;

async function issue(cookie: string, body: Record<string, unknown>) {
  const res = await as(cookie)('POST', '/api/admin/photos/upload-url', {
    contentType: 'image/webp',
    size: BYTES.length,
    ...body,
  });
  return { res, issued: res.status === 200 ? uploadUrlResponseSchema.parse(res.body) : null };
}

/** The whole browser side: sign, POST to Cloudinary, report the result to confirm. */
async function addPhoto(cookie: string, body: Record<string, unknown>, alt = 'A clean fade') {
  const { res, issued } = await issue(cookie, body);
  if (!issued) throw new Error(`upload-url failed: ${String(res.status)}`);
  const uploaded = (await (await fake.browserUpload(issued, BYTES)).json()) as {
    public_id: string;
    version: number;
    width: number;
    height: number;
    bytes: number;
  };
  const confirmed = await as(cookie)('POST', '/api/admin/photos/confirm', {
    ticket: issued.ticket,
    width: uploaded.width,
    height: uploaded.height,
    alt,
    cloudinary: {
      publicId: uploaded.public_id,
      version: uploaded.version,
      bytes: uploaded.bytes,
    },
  });
  return { issued, uploaded, confirmed };
}

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'cloudinary';
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  process.env.CLOUDINARY_API_KEY = KEY;
  process.env.CLOUDINARY_API_SECRET = SECRET;
  process.env.CLOUDINARY_FOLDER = FOLDER;
  resetEnvCache();
  resetStorageCache();
  fake = installFakeCloudinary({ cloud: CLOUD, apiKey: KEY, apiSecret: SECRET });
  await runSeed(db(), NOW);
  server = await startTestServer();
  ownerCookie = await sessionCookie(
    (await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') }))._id,
  );
  marcusCookie = await sessionCookie((await createLogin({ role: 'barber', staffId: marcus }))._id);
});
afterAll(async () => {
  await server.close();
  fake.restore();
  process.env.STORAGE_DRIVER = 'local';
  for (const name of [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_FOLDER',
  ]) {
    Reflect.deleteProperty(process.env, name);
  }
  resetEnvCache();
  resetStorageCache();
});

describe('the signature', () => {
  it('is for a POST to Cloudinary with the folder and a server made public id, and never carries the secret', async () => {
    const { res, issued } = await issue(ownerCookie, { kind: 'gallery' });
    expect(res.status).toBe(200);
    if (!issued) throw new Error('no upload');
    expect(issued.method).toBe('POST');
    expect(issued.uploadUrl).toBe(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`);
    const fields = issued.fields ?? {};
    expect(fields.api_key).toBe(KEY);
    expect(fields.folder).toBe(FOLDER);
    expect(fields.public_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(issued.key).toBe(`${FOLDER}/${fields.public_id}`);
    expect(photoKeySchema.safeParse(issued.key).success).toBe(true);
    expect(fields.signature).toBe(
      signParams(
        { folder: FOLDER, public_id: fields.public_id ?? '', timestamp: fields.timestamp ?? '' },
        SECRET,
      ),
    );
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('is refused above 10 MB, for other types, and without a session', async () => {
    expect(
      (await issue(ownerCookie, { kind: 'gallery', size: 10 * 1024 * 1024 + 1 })).res.status,
    ).toBe(400);
    expect(
      (await issue(ownerCookie, { kind: 'gallery', contentType: 'image/gif' })).res.status,
    ).toBe(400);
    const anonymous = await call(server.baseUrl, 'POST', '/api/admin/photos/upload-url', {
      body: { kind: 'gallery', contentType: 'image/webp', size: 100 },
    });
    expect(anonymous.status).toBe(401);
  });
});

describe('who can get a signature', () => {
  it('a barber cannot, until the owner allows it, and then only for their own portrait', async () => {
    expect((await issue(marcusCookie, { kind: 'staff', staffId: marcus })).res.status).toBe(403);
    await shopSettingsRepo.updateShopSettings(
      {
        ...shopSettingsSeed,
        permissions: { barbersCanBlockTime: false, barbersCanUploadPhotos: true },
      },
      new Date(),
    );
    const mine = await issue(marcusCookie, { kind: 'staff', staffId: marcus });
    expect(mine.res.status).toBe(200);
    expect(mine.issued?.method).toBe('POST');
    // Not another chair's portrait, not the gallery, not the home hero.
    expect((await issue(marcusCookie, { kind: 'staff', staffId: dee })).res.status).toBe(403);
    expect((await issue(marcusCookie, { kind: 'gallery', staffId: marcus })).res.status).toBe(403);
    expect((await issue(marcusCookie, { kind: 'gallery' })).res.status).toBe(403);
    expect((await issue(marcusCookie, { kind: 'hero' })).res.status).toBe(403);
    // And a ticket issued to the owner for the gallery cannot be confirmed by the barber.
    const { issued } = await issue(ownerCookie, { kind: 'gallery' });
    if (!issued) throw new Error('no upload');
    const uploaded = (await (await fake.browserUpload(issued, BYTES)).json()) as {
      public_id: string;
      version: number;
      bytes: number;
    };
    const stolen = await as(marcusCookie)('POST', '/api/admin/photos/confirm', {
      ticket: issued.ticket,
      width: 10,
      height: 10,
      alt: 'x',
      cloudinary: {
        publicId: uploaded.public_id,
        version: uploaded.version,
        bytes: uploaded.bytes,
      },
    });
    expect(stolen.status).toBe(403);
  });
});

describe('upload, confirm, show and delete', () => {
  it('saves a gallery photo after verifying the asset, shows it with exact sizes, and destroys it on delete', async () => {
    const { issued, confirmed } = await addPhoto(ownerCookie, { kind: 'gallery', staffId: dee });
    expect(confirmed.status).toBe(201);
    const photo = adminPhotoResponseSchema.parse(confirmed.body).photo;
    expect(photo.url).toBe(
      `https://res.cloudinary.com/${CLOUD}/image/upload/f_auto,q_auto,c_limit,w_1600/${issued.key}`,
    );
    expect(photo.delivery).toEqual({ cloud: CLOUD, publicId: issued.key });
    expect(fake.assets.has(issued.key)).toBe(true);
    expect(fake.calls).toContain(`GET /resources/image/upload/${issued.key}`);

    const gallery = galleryResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/gallery')).body,
    );
    expect(gallery.photos.find((p) => p.id === photo.id)?.delivery?.publicId).toBe(issued.key);

    // A hero shows on the shop route.
    const hero = await addPhoto(ownerCookie, { kind: 'hero' }, 'The shop');
    expect(hero.confirmed.status).toBe(201);
    const shop = publicShopSchema.parse((await call(server.baseUrl, 'GET', '/api/shop')).body);
    expect(shop.heroPhoto?.delivery?.cloud).toBe(CLOUD);

    // Delete is soft first; the purge destroys the Cloudinary asset with a signed call.
    expect((await as(ownerCookie)('DELETE', `/api/admin/photos/${photo.id}`)).status).toBe(200);
    expect(fake.assets.has(issued.key)).toBe(true);
    expect(await purgeDeletedPhotos(new Date())).toBeGreaterThanOrEqual(1);
    expect(fake.assets.has(issued.key)).toBe(false);
    expect(fake.calls).toContain('POST /image/destroy');
  });

  it("refuses a missing asset, someone else's public id, a wrong version and wrong bytes", async () => {
    const missing = await issue(ownerCookie, { kind: 'gallery' });
    if (!missing.issued) throw new Error('no upload');
    const none = await as(ownerCookie)('POST', '/api/admin/photos/confirm', {
      ticket: missing.issued.ticket,
      width: 10,
      height: 10,
      alt: 'x',
      cloudinary: { publicId: missing.issued.key, version: 1, bytes: BYTES.length },
    });
    expect(none.status).toBe(409);

    const first = await issue(ownerCookie, { kind: 'gallery' });
    const second = await issue(ownerCookie, { kind: 'gallery' });
    if (!first.issued || !second.issued) throw new Error('no upload');
    const up = (await (await fake.browserUpload(first.issued, BYTES)).json()) as {
      public_id: string;
      version: number;
      bytes: number;
    };
    const wrongId = await as(ownerCookie)('POST', '/api/admin/photos/confirm', {
      ticket: second.issued.ticket,
      width: 10,
      height: 10,
      alt: 'x',
      cloudinary: { publicId: up.public_id, version: up.version, bytes: up.bytes },
    });
    expect(wrongId.status).toBe(403);
    expect(codeOf(wrongId.body)).toBe('INVALID_TOKEN');
    const noReport = await as(ownerCookie)('POST', '/api/admin/photos/confirm', {
      ticket: first.issued.ticket,
      width: 10,
      height: 10,
      alt: 'x',
    });
    expect(noReport.status).toBe(403);

    const badVersion = await as(ownerCookie)('POST', '/api/admin/photos/confirm', {
      ticket: first.issued.ticket,
      width: 10,
      height: 10,
      alt: 'x',
      cloudinary: { publicId: up.public_id, version: up.version + 1, bytes: up.bytes },
    });
    expect(badVersion.status).toBe(409);
    // A mismatch removes the asset before anyone hears about it.
    expect(fake.assets.has(first.issued.key)).toBe(false);

    const third = await issue(ownerCookie, { kind: 'gallery' });
    if (!third.issued) throw new Error('no upload');
    const up3 = (await (await fake.browserUpload(third.issued, BYTES)).json()) as {
      public_id: string;
      version: number;
    };
    const badBytes = await as(ownerCookie)('POST', '/api/admin/photos/confirm', {
      ticket: third.issued.ticket,
      width: 10,
      height: 10,
      alt: 'x',
      cloudinary: { publicId: up3.public_id, version: up3.version, bytes: BYTES.length + 5 },
    });
    expect(badBytes.status).toBe(409);
  });

  it('a signature made with the wrong secret is refused by Cloudinary itself', async () => {
    const { issued } = await issue(ownerCookie, { kind: 'gallery' });
    if (!issued) throw new Error('no upload');
    const forged = { ...issued, fields: { ...issued.fields, signature: 'f'.repeat(40) } };
    expect((await fake.browserUpload(forged as UploadUrlResponse, BYTES)).status).toBe(401);
  });
});

describe('the orphan sweep and the doctor', () => {
  it('removes unreferenced assets older than 24 hours and keeps everything else', async () => {
    const kept = await addPhoto(ownerCookie, { kind: 'gallery' });
    expect(kept.confirmed.status).toBe(201);
    const now = new Date();
    const old = new Date(now.getTime() - ORPHAN_AGE_MS - 60 * 60_000);
    const seed = (id: string, createdAt: Date) =>
      fake.assets.set(`${FOLDER}/${id}`, {
        publicId: `${FOLDER}/${id}`,
        bytes: 10,
        version: 1,
        format: 'webp',
        width: 10,
        height: 10,
        createdAt,
      });
    seed('00000000-0000-4000-8000-000000000001', old);
    seed('00000000-0000-4000-8000-000000000002', new Date(now.getTime() - 2 * 60 * 60_000));
    // Even old, an asset a photo record points at stays.
    const keptAsset = fake.assets.get(kept.issued.key);
    if (keptAsset) keptAsset.createdAt = old;

    expect(await sweepStorageOrphans(now)).toBe(1);
    expect(fake.assets.has(`${FOLDER}/00000000-0000-4000-8000-000000000001`)).toBe(false);
    expect(fake.assets.has(`${FOLDER}/00000000-0000-4000-8000-000000000002`)).toBe(true);
    expect(fake.assets.has(kept.issued.key)).toBe(true);
    expect(await sweepStorageOrphans(now)).toBe(0);
  });

  it('the doctor checks the keys with a signed ping and says what backups mean', async () => {
    const ok = await runDoctor();
    const storage = ok.checks.find((c) => c.id === 'storage');
    expect(storage?.status).toBe('pass');
    expect(storage?.detail).toContain('Cloudinary Admin API');
    expect(ok.checks.find((c) => c.id === 'backups')?.status).toBe('warn');
    expect(fake.calls).toContain('GET /ping');

    process.env.CLOUDINARY_API_SECRET = 'a-different-secret-that-is-wrong-0000';
    resetEnvCache();
    resetStorageCache();
    const bad = await runDoctor();
    expect(bad.checks.find((c) => c.id === 'storage')?.status).toBe('fail');
    process.env.CLOUDINARY_API_SECRET = SECRET;
    resetEnvCache();
    resetStorageCache();
  });
});
