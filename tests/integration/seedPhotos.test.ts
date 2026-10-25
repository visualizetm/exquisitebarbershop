import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '../../server/env';
import { logger } from '../../server/lib/logger';
import { photosRepo } from '../../server/repos';
import { loadSeedPhotos, seedPhotoId } from '../../server/services/seedPhotos';
import { runSeed } from '../../server/services/seedService';
import { getStorage, resetStorageCache } from '../../server/storage';
import { galleryResponseSchema } from '../../shared/api/photos';
import { publicShopSchema } from '../../shared/api/public';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';
import { fakeWebp, makeSeedPhotoDir, type FixturePhoto } from '../helpers/seedPhotoFixtures';

/**
 * The seed photo loader against fixture folders built at test time (never seed/photos itself),
 * with photos in GridFS so every byte stays in this file's database.
 */
const { db } = useTestDb();
let server: TestServer;

const PHOTOS: FixturePhoto[] = [
  {
    file: 'exq-01-hero.webp',
    kind: 'hero',
    alt: 'A barber and his client',
    sortOrder: 0,
    size: [1200, 1600],
  },
  {
    file: 'exq-02-waves.webp',
    kind: 'gallery',
    alt: 'Waves and a beard',
    sortOrder: 10,
    home: true,
    size: null,
  },
  {
    file: 'exq-03-fade.webp',
    kind: 'gallery',
    alt: 'A skin fade',
    sortOrder: 20,
    size: [1280, 1600],
  },
  {
    file: 'exq-04-color.webp',
    kind: 'gallery',
    alt: 'Color on waves',
    sortOrder: 30,
    home: true,
    size: [1290, 1290],
  },
  {
    file: 'exq-05-kids.webp',
    kind: 'gallery',
    alt: 'A kids design',
    sortOrder: 40,
    home: true,
    size: null,
  },
  {
    file: 'exq-06-part.webp',
    kind: 'gallery',
    alt: 'A hard part',
    sortOrder: 50,
    size: [1000, 1250],
  },
];
const dir = makeSeedPhotoDir(PHOTOS);
const PRESENT = ['exq-01-hero.webp', 'exq-03-fade.webp', 'exq-04-color.webp', 'exq-06-part.webp'];

function useDriver(driver: string) {
  process.env.STORAGE_DRIVER = driver;
  resetEnvCache();
  resetStorageCache();
}

beforeAll(async () => {
  server = await startTestServer();
  process.env.APP_BASE_URL = server.baseUrl;
  process.env.SEED_PHOTOS_DIR = dir;
  useDriver('mongo');
  await runSeed(db(), NOW);
});
afterAll(async () => {
  Reflect.deleteProperty(process.env, 'SEED_PHOTOS_DIR');
  useDriver('local');
  await server.close();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('loading the seed photos', () => {
  it('stores every file that is there through the storage driver, with the size from its header', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const summary = await loadSeedPhotos(NOW);
    expect(summary).toMatchObject({
      dir,
      added: PRESENT,
      existing: [],
      missing: ['exq-02-waves.webp', 'exq-05-kids.webp'],
      failed: [],
      skipped: null,
    });
    // One warning for the whole run, naming every missing file.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/2 of 6 files are not in the folder yet/);
    expect(warn.mock.calls[0]?.[1]).toMatchObject({
      missing: ['exq-02-waves.webp', 'exq-05-kids.webp'],
    });

    const hero = await photosRepo.findPhotoById(seedPhotoId('exq-01-hero.webp'));
    expect(hero).toMatchObject({
      kind: 'hero',
      staffId: null,
      alt: 'A barber and his client',
      width: 1200,
      height: 1600,
      sortOrder: 0,
      deletedAt: null,
      createdBy: { type: 'system' },
    });
    expect(hero?.home).toBeUndefined();
    expect(hero?.key).toMatch(/^hero\/[0-9a-f-]{36}\.webp$/);
    const color = await photosRepo.findPhotoById(seedPhotoId('exq-04-color.webp'));
    expect(color).toMatchObject({ kind: 'gallery', width: 1290, height: 1290, home: true });
    expect(color?.key).toMatch(/^gallery\/[0-9a-f-]{36}\.webp$/);

    // The bytes went through the driver (GridFS here), unchanged.
    const stored = await getStorage().get(hero?.key ?? '');
    expect(Buffer.from(stored ?? []).equals(readFileSync(join(dir, 'exq-01-hero.webp')))).toBe(
      true,
    );
    expect(await db().collection('media.files').countDocuments()).toBe(4);
    const audit = await db().collection('auditLog').find({ action: 'photo.seed' }).toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.after).toEqual({ added: PRESENT });
  });

  it('is idempotent: a second run adds nothing and stores nothing again', async () => {
    const summary = await loadSeedPhotos(NOW);
    expect(summary.added).toEqual([]);
    expect(summary.existing).toEqual(PRESENT);
    expect(summary.missing).toEqual(['exq-02-waves.webp', 'exq-05-kids.webp']);
    expect(await db().collection('photos').countDocuments()).toBe(4);
    expect(await db().collection('media.files').countDocuments()).toBe(4);
    expect(await db().collection('auditLog').countDocuments({ action: 'photo.seed' })).toBe(1);
  });

  it('keeps a seed photo the owner deleted, and a home photo the owner chose', async () => {
    await photosRepo.softDeletePhoto(seedPhotoId('exq-06-part.webp'), NOW);
    const ownHero = await photosRepo.insertPhoto(
      {
        kind: 'hero',
        staffId: null,
        key: 'hero/0f8fad5b-d9cb-469f-a165-70867728950e.webp',
        width: 1600,
        height: 2000,
        alt: 'The owner chose this one',
        sortOrder: 0,
        createdBy: { type: 'system', userId: null, staffId: null },
      },
      NOW,
    );
    await db()
      .collection('photos')
      .deleteOne({ _id: seedPhotoId('exq-01-hero.webp') } as never);

    const summary = await loadSeedPhotos(NOW);
    expect(summary.added).toEqual([]);
    expect(summary.existing).toEqual(PRESENT);
    const heroes = await photosRepo.listPhotos({ kind: 'hero' });
    expect(heroes.map((p) => p._id)).toEqual([ownHero._id]);
    expect((await photosRepo.findPhotoById(seedPhotoId('exq-06-part.webp')))?.deletedAt).toEqual(
      NOW,
    );

    // Put the seeded hero back for the tests below.
    await db()
      .collection('photos')
      .deleteOne({ _id: ownHero._id } as never);
    expect((await loadSeedPhotos(NOW)).added).toEqual(['exq-01-hero.webp']);
  });

  it('picks up a missing photo the moment its file is added', async () => {
    writeFileSync(join(dir, 'exq-02-waves.webp'), fakeWebp(1280, 1600));
    const summary = await loadSeedPhotos(NOW);
    expect(summary.added).toEqual(['exq-02-waves.webp']);
    expect(summary.missing).toEqual(['exq-05-kids.webp']);
    const waves = await photosRepo.findPhotoById(seedPhotoId('exq-02-waves.webp'));
    expect(waves).toMatchObject({ width: 1280, height: 1600, home: true, sortOrder: 10 });
  });

  it('never throws: no manifest, a bad manifest, storage turned off, a file that is not a WebP', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const empty = mkdtempSync(join(tmpdir(), 'exq-seed-empty-'));
    expect((await loadSeedPhotos(NOW, { dir: empty })).skipped).toBe('no-manifest');

    const bad = mkdtempSync(join(tmpdir(), 'exq-seed-bad-'));
    writeFileSync(join(bad, 'manifest.json'), '{"photos": [{"file": "../escape.webp"}]}');
    expect((await loadSeedPhotos(NOW, { dir: bad })).skipped).toBe('bad-manifest');
    writeFileSync(join(bad, 'manifest.json'), 'not json');
    expect((await loadSeedPhotos(NOW, { dir: bad })).skipped).toBe('bad-manifest');

    const junk = makeSeedPhotoDir([
      { file: 'exq-90-junk.webp', kind: 'gallery', alt: 'Junk', sortOrder: 900, size: null },
    ]);
    writeFileSync(join(junk, 'exq-90-junk.webp'), 'this is not an image, only text in a file');
    const summary = await loadSeedPhotos(NOW, { dir: junk });
    expect(summary.failed).toEqual(['exq-90-junk.webp']);
    expect(await photosRepo.findPhotoById(seedPhotoId('exq-90-junk.webp'))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(4);

    useDriver('none');
    try {
      expect((await loadSeedPhotos(NOW)).skipped).toBe('storage-off');
    } finally {
      useDriver('mongo');
    }
  });
});

describe('the public photo API', () => {
  it('serves the seeded hero and gallery, in manifest order and in the Home order', async () => {
    const shop = publicShopSchema.parse((await call(server.baseUrl, 'GET', '/api/shop')).body);
    expect(shop.heroPhoto).toMatchObject({
      id: seedPhotoId('exq-01-hero.webp'),
      width: 1200,
      height: 1600,
      alt: 'A barber and his client',
    });
    const media = await fetch(shop.heroPhoto?.url ?? '');
    expect(media.status).toBe(200);
    expect(media.headers.get('content-type')).toBe('image/webp');
    expect(
      Buffer.from(await media.arrayBuffer()).equals(readFileSync(join(dir, 'exq-01-hero.webp'))),
    ).toBe(true);

    const gallery = galleryResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/gallery')).body,
    );
    // exq-06 was deleted by the owner above; nobody is credited, so there are no chair counts.
    expect(gallery.photos.map((p) => p.alt)).toEqual([
      'Waves and a beard',
      'A skin fade',
      'Color on waves',
    ]);
    expect(gallery.photos.every((p) => p.staff === null)).toBe(true);
    expect(gallery.counts).toEqual([]);

    const home = galleryResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/gallery?home=true&limit=6')).body,
    );
    expect(home.photos.map((p) => p.alt)).toEqual([
      'Waves and a beard',
      'Color on waves',
      'A skin fade',
    ]);
    const firstTwo = galleryResponseSchema.parse(
      (await call(server.baseUrl, 'GET', '/api/gallery?home=1&limit=2')).body,
    );
    const rest = galleryResponseSchema.parse(
      (
        await call(
          server.baseUrl,
          'GET',
          `/api/gallery?home=1&limit=2&cursor=${firstTwo.nextCursor ?? ''}`,
        )
      ).body,
    );
    expect([...firstTwo.photos, ...rest.photos].map((p) => p.id)).toEqual(
      home.photos.map((p) => p.id),
    );
    expect((await call(server.baseUrl, 'GET', '/api/gallery?home=maybe')).status).toBe(400);
  });
});
