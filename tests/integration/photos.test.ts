import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../server/lib/ids';
import { resetEnvCache } from '../../server/env';
import { purgeDeletedPhotos, sweepAbandonedUploads } from '../../server/services/photosService';
import { runSeed } from '../../server/services/seedService';
import { localPathFor } from '../../server/storage/local';
import { staffSeedId } from '../../seed/shop';
import { apiErrorSchema } from '../../shared/api/errors';
import {
  adminPhotoListResponseSchema,
  adminPhotoResponseSchema,
  galleryResponseSchema,
  uploadUrlResponseSchema,
  type UploadUrlResponse,
} from '../../shared/api/photos';
import { publicShopSchema, publicStaffListResponseSchema } from '../../shared/api/public';
import { photoKeySchema } from '../../shared/schemas/photo';
import { createLogin, sessionCookie, teamCookie } from '../helpers/auth';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

const { db } = useTestDb();
let server: TestServer;
let ownerCookie: string;
const lee = staffSeedId('lee');
const drew = staffSeedId('drew');

/** A tiny valid-looking WebP payload; the server only checks size and type, never decodes. */
const BYTES = Buffer.from('RIFF....WEBPVP8 ' + 'x'.repeat(200));

const as =
  (cookie: string) =>
  (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    call(server.baseUrl, method, path, {
      headers: { cookie, ...headers },
      ...(body === undefined ? {} : { body }),
    });
const owner = (m: string, p: string, b?: unknown) => as(ownerCookie)(m, p, b);
const codeOf = (body: unknown) => apiErrorSchema.parse(body).error.code;

/** PUTs bytes to the presigned URL through the test server (same path, our port). */
async function put(issued: UploadUrlResponse, bytes: Buffer, contentType?: string) {
  const u = new URL(issued.uploadUrl);
  return fetch(`${server.baseUrl}${u.pathname}${u.search}`, {
    method: 'PUT',
    headers: { 'content-type': contentType ?? issued.headers['Content-Type'] ?? 'image/webp' },
    body: bytes,
  });
}

async function issue(cookie: string, body: Record<string, unknown>) {
  const res = await as(cookie)('POST', '/api/admin/photos/upload-url', {
    contentType: 'image/webp',
    size: BYTES.length,
    ...body,
  });
  return { res, issued: res.status === 200 ? uploadUrlResponseSchema.parse(res.body) : null };
}

async function uploadAndConfirm(
  cookie: string,
  body: Record<string, unknown>,
  alt = 'A clean fade',
) {
  const { res, issued } = await issue(cookie, body);
  if (!issued) throw new Error(`upload-url failed: ${res.status} ${JSON.stringify(res.body)}`);
  expect((await put(issued, BYTES)).status).toBe(200);
  const confirmed = await as(cookie)('POST', '/api/admin/photos/confirm', {
    ticket: issued.ticket,
    width: 1600,
    height: 2000,
    alt,
  });
  if (confirmed.status !== 201)
    throw new Error(`confirm failed: ${confirmed.status} ${JSON.stringify(confirmed.body)}`);
  return { issued, photo: adminPhotoResponseSchema.parse(confirmed.body).photo };
}

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'local';
  await runSeed(db(), NOW);
  server = await startTestServer();
  const ownerLogin = await createLogin({ role: 'owner', staffId: staffSeedId('dontrise') });
  ownerCookie = await sessionCookie(ownerLogin._id);
});
afterAll(async () => {
  await server.close();
});

describe('upload limits and keys', () => {
  it('refuses other types, oversized files and a staff photo without a chair', async () => {
    const gif = await issue(ownerCookie, { kind: 'gallery', contentType: 'image/gif' });
    expect(gif.res.status).toBe(400);
    const big = await issue(ownerCookie, { kind: 'gallery', size: 10 * 1024 * 1024 + 1 });
    expect(big.res.status).toBe(400);
    const noChair = await issue(ownerCookie, { kind: 'staff' });
    expect(noChair.res.status).toBe(400);
    expect(apiErrorSchema.parse(noChair.res.body).error.details?.[0]?.path).toBe('staffId');
    const gone = await issue(ownerCookie, { kind: 'staff', staffId: newId() });
    expect(gone.res.status).toBe(404);
  });

  it('generates the key itself and ignores one sent by the client', async () => {
    const { res, issued } = await issue(ownerCookie, {
      kind: 'staff',
      staffId: lee,
      key: 'hero/evil.webp',
    });
    expect(res.status).toBe(200);
    expect(issued?.key.startsWith(`staff/${lee}/`)).toBe(true);
    expect(photoKeySchema.safeParse(issued?.key).success).toBe(true);
    expect(issued?.method).toBe('PUT');
    expect(new Date(issued?.expiresAt ?? 0).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    const hero = await issue(ownerCookie, { kind: 'hero', staffId: lee });
    expect(hero.issued?.key.startsWith('hero/')).toBe(true);
  });
});

describe('confirm', () => {
  it('rejects a missing object, a size or type mismatch, and a tampered ticket', async () => {
    const { issued } = await issue(ownerCookie, { kind: 'gallery' });
    if (!issued) throw new Error('no upload url');
    const body = { ticket: issued.ticket, width: 100, height: 100, alt: 'x' };
    const missing = await owner('POST', '/api/admin/photos/confirm', body);
    expect(missing.status).toBe(409);
    expect(await put(issued, Buffer.concat([BYTES, Buffer.from('!')]))).toMatchObject({
      status: 200,
    });
    const wrongSize = await owner('POST', '/api/admin/photos/confirm', body);
    expect(wrongSize.status).toBe(409);
    // A mismatch leaves nothing behind in storage.
    expect(existsSync(localPathFor(issued.key))).toBe(false);
    await put(issued, BYTES, 'image/png');
    const wrongType = await owner('POST', '/api/admin/photos/confirm', body);
    expect(wrongType.status).toBe(409);
    expect(existsSync(localPathFor(issued.key))).toBe(false);
    await put(issued, BYTES);
    const tampered = await owner('POST', '/api/admin/photos/confirm', {
      ...body,
      ticket: `${issued.ticket.slice(0, -2)}zz`,
    });
    expect(codeOf(tampered.body)).toBe('INVALID_TOKEN');
    const noAlt = await owner('POST', '/api/admin/photos/confirm', { ...body, alt: '  ' });
    expect(noAlt.status).toBe(400);
    const ok = await owner('POST', '/api/admin/photos/confirm', body);
    expect(ok.status).toBe(201);
  });

  it('sweeps uploads that were issued over an hour ago and never confirmed', async () => {
    const { issued: stale } = await issue(ownerCookie, { kind: 'gallery' });
    const { issued: fresh } = await issue(ownerCookie, { kind: 'gallery' });
    if (!stale || !fresh) throw new Error('no upload url');
    await put(stale, BYTES);
    await put(fresh, BYTES);
    await db()
      .collection<{ key: string }>('pendingUploads')
      .updateOne(
        { key: stale.key },
        // The test server issues at NOW; only this record is stale when the sweep runs at NOW.
        { $set: { issuedAt: new Date(NOW.getTime() - 2 * 60 * 60_000) } },
      );
    expect(await sweepAbandonedUploads(NOW)).toBe(1);
    expect(existsSync(localPathFor(stale.key))).toBe(false);
    expect(existsSync(localPathFor(fresh.key))).toBe(true);
    expect(await db().collection('pendingUploads').countDocuments({ key: stale.key })).toBe(0);
    // Confirming the fresh one removes its record, so a later sweep leaves it alone.
    const ok = await owner('POST', '/api/admin/photos/confirm', {
      ticket: fresh.ticket,
      width: 10,
      height: 10,
      alt: 'kept',
    });
    expect(ok.status).toBe(201);
    expect(await db().collection('pendingUploads').countDocuments({ key: fresh.key })).toBe(0);
    await sweepAbandonedUploads(new Date(NOW.getTime() + 3 * 60 * 60_000));
    expect(existsSync(localPathFor(fresh.key))).toBe(true);
  });

  it('the PUT itself needs a valid signature', async () => {
    const { issued } = await issue(ownerCookie, { kind: 'gallery' });
    if (!issued) throw new Error('no upload url');
    const u = new URL(issued.uploadUrl);
    const bad = await fetch(
      `${server.baseUrl}${u.pathname}?exp=${u.searchParams.get('exp') ?? ''}&sig=nope`,
      {
        method: 'PUT',
        body: BYTES,
      },
    );
    expect(bad.status).toBe(403);
    const otherKey = await fetch(
      `${server.baseUrl}/uploads/hero/${newId().slice(0, 8)}-0000-0000-0000-000000000000.webp${u.search}`,
      { method: 'PUT', body: BYTES },
    );
    expect(otherKey.status).toBe(403);
  });
});

describe('R2_KEY_PREFIX', () => {
  it('puts every generated key under the prefix and the flow still works end to end', async () => {
    process.env.R2_KEY_PREFIX = 'preview/';
    resetEnvCache();
    try {
      const { issued, photo } = await uploadAndConfirm(ownerCookie, { kind: 'hero' }, 'Prefixed');
      expect(issued.key.startsWith('preview/hero/')).toBe(true);
      expect(photoKeySchema.safeParse(issued.key).success).toBe(true);
      expect(photo.url.endsWith(`/uploads/${issued.key}`)).toBe(true);
      expect(existsSync(localPathFor(issued.key))).toBe(true);
      expect((await owner('DELETE', `/api/admin/photos/${photo.id}`)).status).toBe(200);
      await purgeDeletedPhotos(new Date());
      expect(existsSync(localPathFor(issued.key))).toBe(false);
    } finally {
      delete process.env.R2_KEY_PREFIX;
      resetEnvCache();
    }
  });

  it('refuses a prefix that does not end in a slash', () => {
    expect(
      photoKeySchema.safeParse(
        'Preview/hero/' + '0'.repeat(8) + '-0000-0000-0000-000000000000.webp',
      ).success,
    ).toBe(false);
  });
});

describe('the local driver end to end', () => {
  it('uploads, publishes, edits, soft deletes and purges a staff photo', async () => {
    const { issued, photo } = await uploadAndConfirm(ownerCookie, {
      kind: 'staff',
      staffId: lee,
    });
    expect(photo).toMatchObject({
      kind: 'staff',
      staffId: lee,
      alt: 'A clean fade',
      width: 1600,
    });
    expect(photo.url.endsWith(`/uploads/${issued.key}`)).toBe(true);
    expect(existsSync(localPathFor(issued.key))).toBe(true);

    const served = await fetch(`${server.baseUrl}/uploads/${issued.key}`);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/webp');
    expect((await served.arrayBuffer()).byteLength).toBe(BYTES.length);

    const staff = publicStaffListResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/staff')).body,
    );
    expect(staff.staff.find((s) => s.id === lee)?.photo?.id).toBe(photo.id);

    const edited = await owner('PATCH', `/api/admin/photos/${photo.id}`, {
      alt: 'Skin fade, side part',
    });
    expect(adminPhotoResponseSchema.parse(edited.body).photo.alt).toBe('Skin fade, side part');
    expect((await owner('PATCH', `/api/admin/photos/${photo.id}`, {})).status).toBe(400);

    expect((await owner('DELETE', `/api/admin/photos/${photo.id}`)).status).toBe(200);
    expect(existsSync(localPathFor(issued.key))).toBe(true);
    const list = adminPhotoListResponseSchema.parse(
      (await owner('GET', `/api/admin/photos?kind=staff&staffId=${lee}`)).body,
    );
    expect(list.photos.map((p) => p.id)).not.toContain(photo.id);
    expect(await purgeDeletedPhotos(new Date())).toBeGreaterThanOrEqual(1);
    expect(existsSync(localPathFor(issued.key))).toBe(false);
    expect(
      await db()
        .collection('photos')
        .countDocuments({ _id: photo.id } as never),
    ).toBe(1);
    const audit = await db()
      .collection<{ action: string }>('auditLog')
      .find({ entityId: photo.id })
      .toArray();
    expect(audit.map((a) => a.action).sort()).toEqual([
      'photo.create',
      'photo.delete',
      'photo.update',
    ]);
  });

  it('the hero shows on /api/shop and the gallery pages with per chair counts', async () => {
    const { photo: hero } = await uploadAndConfirm(ownerCookie, { kind: 'hero' }, 'The shop floor');
    const shop = publicShopSchema.parse((await call(server.baseUrl, 'GET', '/api/shop')).body);
    expect(shop.heroPhoto?.id).toBe(hero.id);

    for (let i = 0; i < 3; i += 1)
      await uploadAndConfirm(ownerCookie, { kind: 'gallery', staffId: lee }, `Lee cut ${i}`);
    await uploadAndConfirm(ownerCookie, { kind: 'gallery', staffId: drew }, 'Drew design');
    const page1 = galleryResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/gallery?limit=2')).body,
    );
    expect(page1.photos).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    expect(page1.counts.find((c) => c.staffId === lee)?.count).toBe(3);
    const page2 = galleryResponseSchema.parse(
      (await call(server.baseUrl, 'GET', `/api/gallery?limit=2&cursor=${page1.nextCursor ?? ''}`))
        .body,
    );
    expect(page2.photos.map((p) => p.id)).not.toEqual(page1.photos.map((p) => p.id));
    const onlyDee = galleryResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/gallery?staff=drew')).body,
    );
    expect(onlyDee.photos).toHaveLength(1);
    expect(onlyDee.photos[0]?.staff?.slug).toBe('drew');
    expect((await call(server.baseUrl, 'GET', '/api/gallery?staff=nobody')).status).toBe(404);
  });
});

describe('crediting a gallery photo to a barber', () => {
  it('lets the owner tag and untag the work, shows it in the barber filter, and refuses everything else', async () => {
    const { photo } = await uploadAndConfirm(ownerCookie, { kind: 'gallery' }, 'A skin fade');
    expect(photo.staffId).toBeNull();
    const tagged = await owner('PATCH', `/api/admin/photos/${photo.id}`, { staffId: drew });
    expect(tagged.status).toBe(200);
    expect(adminPhotoResponseSchema.parse(tagged.body).photo.staffId).toBe(drew);
    const gallery = galleryResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/gallery?staff=drew')).body,
    );
    expect(gallery.photos.map((p) => p.id)).toContain(photo.id);
    const untagged = await owner('PATCH', `/api/admin/photos/${photo.id}`, { staffId: null });
    expect(adminPhotoResponseSchema.parse(untagged.body).photo.staffId).toBeNull();
    // Unknown barbers are refused, and so is a hero photo.
    expect(
      (await owner('PATCH', `/api/admin/photos/${photo.id}`, { staffId: newId() })).status,
    ).toBe(404);
    const hero = await uploadAndConfirm(ownerCookie, { kind: 'hero' }, 'The shop');
    expect(
      (await owner('PATCH', `/api/admin/photos/${hero.photo.id}`, { staffId: drew })).status,
    ).toBe(403);
    // A barber's PIN session is not an owner session: the photo routes refuse it outright.
    expect(
      (
        await call(server.baseUrl, 'PATCH', `/api/admin/photos/${photo.id}`, {
          headers: { cookie: await teamCookie(lee) },
          body: { staffId: drew },
        })
      ).status,
    ).toBe(401);
  });
});
