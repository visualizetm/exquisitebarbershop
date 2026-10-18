import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../server/lib/ids';
import { resetEnvCache } from '../../server/env';
import { photosRepo } from '../../server/repos';
import { migratePhotos } from '../../server/services/photosMigrate';
import { runSeed } from '../../server/services/seedService';
import { resetStorageCache } from '../../server/storage';
import { writeMedia } from '../../server/storage/mongo';
import { photoKeySchema } from '../../shared/schemas/photo';
import { NOW, useTestDb } from '../helpers/db';
import { installFakeCloudinary, type FakeCloudinary } from '../helpers/fakeCloudinary';

const CLOUD = 'migrate-cloud';
const KEY = '999999999999999';
const SECRET = 'cloudinary-migrate-secret-value';
const FOLDER = 'exquisite/test';
const { db } = useTestDb();
let fake: FakeCloudinary;

const UUIDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];
const BYTES = Buffer.from('RIFF....WEBPVP8 ' + 'x'.repeat(120));

async function addOldPhoto(uuid: string, withBytes = true) {
  const key = `gallery/${uuid}.webp`;
  if (withBytes) await writeMedia(key, BYTES, 'image/webp');
  return photosRepo.insertPhoto(
    {
      kind: 'gallery',
      staffId: null,
      key,
      width: 1600,
      height: 2000,
      alt: `Photo ${uuid.slice(0, 4)}`,
      sortOrder: 0,
      createdBy: { type: 'system', userId: null, staffId: null },
    },
    NOW,
  );
}

beforeAll(async () => {
  process.env.STORAGE_DRIVER = 'mongo';
  process.env.DEMO_MODE = 'true';
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  process.env.CLOUDINARY_API_KEY = KEY;
  process.env.CLOUDINARY_API_SECRET = SECRET;
  process.env.CLOUDINARY_FOLDER = FOLDER;
  resetEnvCache();
  resetStorageCache();
  fake = installFakeCloudinary({ cloud: CLOUD, apiKey: KEY, apiSecret: SECRET });
  await runSeed(db(), NOW);
});
afterAll(() => {
  fake.restore();
  process.env.STORAGE_DRIVER = 'local';
  process.env.DEMO_MODE = 'false';
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

describe('npm run photos:migrate (mongo to cloudinary)', () => {
  it('a dry run reports what it would do and writes nothing', async () => {
    const photos = [await addOldPhoto(UUIDS[0] ?? ''), await addOldPhoto(UUIDS[1] ?? '')];
    const summary = await migratePhotos({ from: 'mongo', dryRun: true });
    expect(summary).toMatchObject({ dryRun: true, found: 2, migrated: 2, adopted: 0, failed: [] });
    expect(fake.assets.size).toBe(0);
    for (const p of photos) expect((await photosRepo.findPhotoById(p._id))?.key).toBe(p.key);
  });

  it('copies each photo, rewrites its record, and does nothing the second time', async () => {
    const summary = await migratePhotos({ from: 'mongo', dryRun: false });
    expect(summary).toMatchObject({ found: 2, migrated: 2, adopted: 0, missing: [], failed: [] });
    expect([...fake.assets.keys()].sort()).toEqual(
      [`${FOLDER}/${UUIDS[0]}`, `${FOLDER}/${UUIDS[1]}`].sort(),
    );
    const live = await photosRepo.listLiveForMigration();
    for (const p of live) {
      expect(p.key.startsWith(`${FOLDER}/`)).toBe(true);
      expect(photoKeySchema.safeParse(p.key).success).toBe(true);
      expect(p.alt).toMatch(/^Photo /);
    }
    const again = await migratePhotos({ from: 'mongo', dryRun: false });
    expect(again).toMatchObject({ found: 0, migrated: 0, adopted: 0 });
    expect(fake.assets.size).toBe(2);
  });

  it('adopts a copy that finished before the record was rewritten, and reports a missing source', async () => {
    const half = await addOldPhoto(UUIDS[2] ?? '');
    // The earlier run copied it and stopped before the record changed.
    fake.assets.set(`${FOLDER}/${UUIDS[2]}`, {
      publicId: `${FOLDER}/${UUIDS[2]}`,
      bytes: BYTES.length,
      version: 1,
      format: 'webp',
      width: 1600,
      height: 2000,
      createdAt: new Date(),
    });
    const lost = await addOldPhoto(newId().slice(0, 8) + '-4444-4444-8444-444444444444', false);
    const summary = await migratePhotos({ from: 'mongo', dryRun: false });
    expect(summary).toMatchObject({ found: 2, adopted: 1, migrated: 0 });
    expect(summary.missing).toEqual([lost.key]);
    expect((await photosRepo.findPhotoById(half._id))?.key).toBe(`${FOLDER}/${UUIDS[2]}`);
    // The one with no bytes stays on the old key so nothing is lost.
    expect((await photosRepo.findPhotoById(lost._id))?.key).toBe(lost.key);
  });
});
