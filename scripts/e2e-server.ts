import { spawn, type ChildProcess } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Everything the end to end tests need, in one process tree: an in-memory
 * replica set, the seeded shop, the API on API_PORT and Vite on WEB_PORT.
 */
const API_PORT = process.env.API_PORT ?? '3002';
const WEB_PORT = process.env.WEB_PORT ?? '5174';

async function main(): Promise<void> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  process.env.NODE_ENV = 'development';
  process.env.MONGODB_URI = replSet.getUri();
  process.env.MONGODB_DB_NAME = 'e2e';
  process.env.MANAGE_LINK_SECRET = 'e2e-manage-link-secret-0123456789abcdef';
  process.env.APP_BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
  process.env.EMAIL_PROVIDER = 'log';
  process.env.OUTBOX_AFTER_RESPONSE = 'on';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';
  process.env.API_PORT = API_PORT;

  const { getDb, closeMongoClient } = await import('../server/db/client');
  const { runSeed } = await import('../server/services/seedService');
  const { createDevServer } = await import('../server/http/dev-adapter');
  await runSeed(await getDb());

  const api = createDevServer();
  await new Promise<void>((resolve) => api.listen(Number(API_PORT), '127.0.0.1', resolve));
  console.log(`e2e API on http://127.0.0.1:${API_PORT}`);

  const vite: ChildProcess = spawn(
    'npx',
    ['vite', '--port', WEB_PORT, '--strictPort', '--host', '127.0.0.1'],
    {
      stdio: 'inherit',
      env: process.env,
    },
  );

  const shutdown = async () => {
    vite.kill('SIGTERM');
    await new Promise<void>((resolve) =>
      api.close(() => {
        resolve();
      }),
    );
    await closeMongoClient();
    await replSet.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  vite.on('exit', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
