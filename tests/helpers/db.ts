import { randomBytes } from 'node:crypto';
import type { Db } from 'mongodb';
import { afterAll, beforeAll, inject } from 'vitest';
import { closeMongoClient, getDb } from '../../server/db/client';
import { ensureIndexes } from '../../server/db/indexes';
import { resetEnvCache } from '../../server/env';

export const TEST_MANAGE_SECRET = 'test-manage-link-secret-0123456789abcdef';

/**
 * Points the server at the shared replica set with a fresh database for this
 * file, creates the production indexes, and tears everything down afterwards.
 */
export function useTestDb(): { db: () => Db } {
  let db: Db | null = null;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = inject('mongoUri');
    process.env.MONGODB_DB_NAME = `test_${randomBytes(6).toString('hex')}`;
    process.env.MANAGE_LINK_SECRET = TEST_MANAGE_SECRET;
    process.env.APP_BASE_URL = 'http://localhost:5173';
    process.env.LOG_LEVEL = 'error';
    resetEnvCache();
    db = await getDb();
    await ensureIndexes(db);
  });

  afterAll(async () => {
    if (db) await db.dropDatabase();
    await closeMongoClient();
  });

  return {
    db: () => {
      if (!db) throw new Error('database not ready');
      return db;
    },
  };
}

export const NOW = new Date('2026-03-10T15:00:00.000Z');
