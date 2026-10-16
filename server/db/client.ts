import { MongoClient, type Db, type MongoClientOptions } from 'mongodb';
import { getEnv } from '../env';
import { logger } from '../lib/logger';

/**
 * One MongoClient per process, cached on globalThis so Vercel's module cache and
 * Vite's dev reloads reuse the same pool instead of leaking connections.
 */
interface MongoCache {
  promise: Promise<MongoClient> | null;
  client: MongoClient | null;
  uri: string | null;
}

const globalWithMongo = globalThis as typeof globalThis & { __exquisiteMongo?: MongoCache };
const cache: MongoCache = globalWithMongo.__exquisiteMongo ?? {
  promise: null,
  client: null,
  uri: null,
};
globalWithMongo.__exquisiteMongo = cache;

export const CLIENT_OPTIONS: MongoClientOptions = {
  appName: 'exquisite-barbershop',
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,
  serverSelectionTimeoutMS: 8_000,
  connectTimeoutMS: 8_000,
  socketTimeoutMS: 45_000,
  waitQueueTimeoutMS: 8_000,
  retryWrites: true,
  retryReads: true,
  writeConcern: { w: 'majority' },
  readConcernLevel: 'majority',
  ignoreUndefined: true,
};

export async function getMongoClient(): Promise<MongoClient> {
  const { MONGODB_URI } = getEnv();
  if (cache.client && cache.uri === MONGODB_URI) return cache.client;
  if (cache.promise && cache.uri === MONGODB_URI) return cache.promise;
  cache.uri = MONGODB_URI;
  cache.promise = new MongoClient(MONGODB_URI, CLIENT_OPTIONS)
    .connect()
    .then((client) => {
      cache.client = client;
      logger.debug('mongo connected');
      return client;
    })
    .catch((error: unknown) => {
      cache.promise = null;
      cache.uri = null;
      throw error;
    });
  return cache.promise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getEnv().MONGODB_DB_NAME);
}

/** Closes and forgets the cached client. Used by scripts and tests. */
export async function closeMongoClient(): Promise<void> {
  const client = cache.client ?? (cache.promise ? await cache.promise.catch(() => null) : null);
  cache.client = null;
  cache.promise = null;
  cache.uri = null;
  if (client) await client.close();
}

/** Lightweight reachability probe for the health check. */
export async function pingDb(): Promise<{ ok: boolean; latencyMs: number | null }> {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    logger.warn('db ping failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, latencyMs: null };
  }
}
