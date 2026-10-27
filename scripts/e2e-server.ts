import { spawn, type ChildProcess } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { E2E_BARBER_PIN, E2E_OWNER } from './e2e-accounts';

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
  process.env.STORAGE_DRIVER = 'local';
  process.env.CRON_SECRET = 'e2e-cron-secret-0123456789abcdef0123456789';
  process.env.BOOTSTRAP_SECRET = 'e2e-bootstrap-secret-0123456789abcdef01234';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';
  process.env.API_PORT = API_PORT;

  const { getDb, closeMongoClient } = await import('../server/db/client');
  const { runSeed } = await import('../server/services/seedService');
  const { createDevServer } = await import('../server/http/dev-adapter');
  const { hashPin } = await import('../server/auth/pin');
  const { staffPinsRepo } = await import('../server/repos');
  const { staffSeed, staffSeedId } = await import('../seed/shop');
  await runSeed(await getDb(), new Date(), {
    ownerEmail: E2E_OWNER.email,
    ownerPassword: E2E_OWNER.password,
  });
  // Every barber has already chosen a PIN, so the tests sign straight in at /team.
  for (const member of staffSeed) {
    const id = staffSeedId(member.key);
    await staffPinsRepo.upsertPin(id, await hashPin(id, E2E_BARBER_PIN), new Date());
  }
  // The shop is open around the clock today and tomorrow (special hours) and every barber has
  // extra hours over the same span, so NOW, the line and the check in work whenever the suite
  // runs. The weekly hours stay as seeded, so the public pages still show the real week.
  const { closuresRepo, timeBlocksRepo } = await import('../server/repos');
  const { addDaysToIsoDate, shopDateOf, shopDayBounds } = await import('../shared/lib/time');
  const today = shopDateOf(new Date());
  for (const date of [today, addDaysToIsoDate(today, 1)]) {
    await closuresRepo.upsertClosure(
      {
        date,
        kind: 'specialHours',
        intervals: [{ start: '00:00', end: '23:59' }],
        label: 'Open all day for the test run',
      },
      new Date(),
    );
    const bounds = shopDayBounds(date);
    for (const member of staffSeed) {
      await timeBlocksRepo.insertTimeBlock(
        {
          staffId: staffSeedId(member.key),
          kind: 'extraHours',
          startAt: bounds.start,
          endAt: bounds.end,
          reason: 'Open all day for the test run',
          createdBy: { type: 'owner', userId: null, staffId: null },
        },
        new Date(),
      );
    }
  }

  // Playwright calls this once per run, so reruns never share rate-limit windows or lockouts.
  // Test-only: it lives in this script, never in the API, and production limits are untouched.
  const api = createDevServer({
    before: async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/__e2e/reset') return false;
      const db = await getDb();
      await db.collection('rateLimits').deleteMany({});
      await db.collection('loginThrottle').deleteMany({});
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":true}');
      return true;
    },
  });
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
