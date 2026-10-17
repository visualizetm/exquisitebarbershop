import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMongoClient } from '../../server/db/client';
import { resetEnvCache } from '../../server/env';
import {
  BACKUP_COLLECTIONS,
  backupDateOf,
  pruneBackups,
  readManifest,
  restoreBackup,
  runBackup,
} from '../../server/services/backup';
import { runSeed } from '../../server/services/seedService';
import { getStorage, resetStorageCache } from '../../server/storage';
import { call, startTestServer, type TestServer } from '../helpers/bookingApi';
import { NOW, useTestDb } from '../helpers/db';

const CRON = 'test-cron-secret-0123456789abcdef0123456789';
process.env.CRON_SECRET = CRON;
process.env.OUTBOX_AFTER_RESPONSE = 'off';
const { db } = useTestDb();
let server: TestServer;
const restoreName = `${process.env.MONGODB_DB_NAME ?? 'test'}_restore`;

beforeAll(async () => {
  await runSeed(db(), NOW);
  process.env.STORAGE_DRIVER = 'local';
  resetEnvCache();
  resetStorageCache();
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
  const client = await getMongoClient();
  await client.db(restoreName).dropDatabase();
});

describe('backups', () => {
  it('exports every business collection as gzipped NDJSON and restores it exactly elsewhere', async () => {
    expect(BACKUP_COLLECTIONS).not.toContain('sessions');
    expect(BACKUP_COLLECTIONS).not.toContain('rateLimits');
    expect(BACKUP_COLLECTIONS).not.toContain('idempotencyKeys');
    expect(BACKUP_COLLECTIONS).toContain('bookings');

    const manifest = await runBackup(NOW);
    expect(manifest.date).toBe('2026-03-10');
    expect(manifest.collections.map((c) => c.name)).toEqual([...BACKUP_COLLECTIONS]);
    const staff = manifest.collections.find((c) => c.name === 'staff');
    expect(staff?.count).toBeGreaterThan(0);
    expect(await readManifest('2026-03-10')).toEqual(manifest);
    expect(await getStorage().head('_backups/2026-03-10/staff.ndjson.gz')).not.toBeNull();

    await expect(
      restoreBackup({ date: '2026-03-10', toDbName: db().databaseName }),
    ).rejects.toThrow(/Refusing to restore over the live database/);
    const result = await restoreBackup({ date: '2026-03-10', toDbName: restoreName });
    expect(result.collections.find((c) => c.name === 'staff')?.restored).toBe(staff?.count);

    const client = await getMongoClient();
    const original = await db().collection('staff').find({}).sort({ _id: 1 }).toArray();
    const restored = await client
      .db(restoreName)
      .collection('staff')
      .find({})
      .sort({ _id: 1 })
      .toArray();
    expect(restored).toEqual(original);
    expect(restored[0]?.createdAt).toBeInstanceOf(Date);

    // The live database was not touched.
    expect(await db().collection('staff').countDocuments()).toBe(original.length);
  });

  it('prunes backups older than thirty days and leaves the rest', async () => {
    const old = new Date(NOW.getTime() - 35 * 24 * 60 * 60_000);
    const fresh = new Date(NOW.getTime() - 5 * 24 * 60 * 60_000);
    await runBackup(old);
    await runBackup(fresh);
    expect(await pruneBackups(NOW)).toBe(1);
    expect(await readManifest(backupDateOf(old))).toBeNull();
    expect(await getStorage().head(`_backups/${backupDateOf(old)}/staff.ndjson.gz`)).toBeNull();
    expect(await readManifest(backupDateOf(fresh))).not.toBeNull();
    expect(await pruneBackups(NOW)).toBe(0);
  });

  it('the daily cron route runs the backstop, the cleanup and the backup in one call', async () => {
    const res = await call(server.baseUrl, 'GET', '/api/internal/cron/daily', {
      headers: { authorization: `Bearer ${CRON}` },
    });
    expect(res.status).toBe(200);
    expect(res.body.outbox).toMatchObject({ sent: 0, failed: 0, remaining: 0 });
    expect(res.body.photosPurged).toBe(0);
    expect(res.body.uploadsSwept).toBe(0);
    expect((res.body.backup as { documents: number }).documents).toBeGreaterThan(0);
    expect(res.body.backupsPruned).toBe(0);
    expect((await call(server.baseUrl, 'GET', '/api/internal/cron/daily')).status).toBe(403);
  });
});
