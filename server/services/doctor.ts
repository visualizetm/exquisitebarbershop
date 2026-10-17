import { randomUUID } from 'node:crypto';
import { getDb, getMongoClient } from '../db/client';
import { COLLECTIONS, INDEXES } from '../db/indexes';
import { currentEnvironment, describeEnv, getPartialEnv } from '../env';
import { shopSettingsRepo, usersRepo } from '../repos';
import { getStorage, keyPrefix } from '../storage';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** What was found, in plain words. Never a value from the environment. */
  detail: string;
  /** What to do when the check did not pass. */
  fix?: string;
}

export interface DoctorReport {
  ok: boolean;
  environment: string;
  checkedAt: string;
  checks: DoctorCheck[];
}

function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // Connection strings carry credentials; never echo one back.
  return text.replace(/mongodb(\+srv)?:\/\/\S+/g, 'mongodb://...').slice(0, 200);
}

function checkEnv(): DoctorCheck[] {
  const { problems } = describeEnv();
  if (problems.length === 0) {
    return [{ id: 'env', label: 'Settings', status: 'pass', detail: 'Every variable is set.' }];
  }
  return problems.map((p) => ({
    id: `env:${p.name}`,
    label: `Setting ${p.name}`,
    status: 'fail' as const,
    detail: p.message,
    fix: p.fix,
  }));
}

async function checkDatabase(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  let db;
  try {
    db = await getDb();
    await db.command({ ping: 1 });
    checks.push({
      id: 'db',
      label: 'Database',
      status: 'pass',
      detail: 'The database answers.',
    });
  } catch (error) {
    return [
      {
        id: 'db',
        label: 'Database',
        status: 'fail',
        detail: describe(error),
        fix: 'Check MONGODB_URI, the database user and password, and that Atlas Network Access allows 0.0.0.0/0 for Vercel.',
      },
    ];
  }
  try {
    const hello = (await db.admin().command({ hello: 1 })) as { setName?: string };
    checks.push(
      hello.setName
        ? {
            id: 'replica-set',
            label: 'Replica set',
            status: 'pass',
            detail: 'The cluster is a replica set, so bookings can use transactions.',
          }
        : {
            id: 'replica-set',
            label: 'Replica set',
            status: 'fail',
            detail: 'The server is not part of a replica set.',
            fix: 'Use an Atlas cluster (every tier is a replica set) rather than a single server.',
          },
    );
  } catch (error) {
    checks.push({
      id: 'replica-set',
      label: 'Replica set',
      status: 'warn',
      detail: `Could not read the cluster description: ${describe(error)}`,
    });
  }
  try {
    const client = await getMongoClient();
    const scratch = db.collection<{ _id: string; at: Date }>('_doctor');
    const id = randomUUID();
    const session = client.startSession();
    try {
      await session
        .withTransaction(async () => {
          await scratch.insertOne({ _id: id, at: new Date() }, { session });
          throw new Error('doctor rollback');
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error) || error.message !== 'doctor rollback') throw error;
        });
    } finally {
      await session.endSession();
    }
    const leftover = await scratch.findOne({ _id: id });
    checks.push(
      leftover
        ? {
            id: 'transactions',
            label: 'Transactions',
            status: 'fail',
            detail: 'A rolled back write stayed in the database.',
            fix: 'The cluster did not honour the transaction. Use an Atlas replica set.',
          }
        : {
            id: 'transactions',
            label: 'Transactions',
            status: 'pass',
            detail: 'A throwaway transaction was rolled back cleanly.',
          },
    );
    await scratch.drop().catch(() => undefined);
  } catch (error) {
    checks.push({
      id: 'transactions',
      label: 'Transactions',
      status: 'fail',
      detail: describe(error),
      fix: 'Transactions need a replica set. Use an Atlas cluster.',
    });
  }
  try {
    const missing: string[] = [];
    for (const name of Object.values(COLLECTIONS)) {
      const wanted = INDEXES.filter((d) => d.collection === name).map((d) => d.options.name);
      if (wanted.length === 0) continue;
      const present = new Set(
        (
          await db
            .collection(name)
            .listIndexes()
            .toArray()
            .catch(() => [])
        ).map((i) => (i as { name: string }).name),
      );
      for (const w of wanted) if (!present.has(w)) missing.push(`${name}.${w}`);
    }
    checks.push(
      missing.length === 0
        ? {
            id: 'indexes',
            label: 'Indexes',
            status: 'pass',
            detail: `All ${INDEXES.length} indexes are present.`,
          }
        : {
            id: 'indexes',
            label: 'Indexes',
            status: 'fail',
            detail: `${missing.length} missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' and more' : ''}.`,
            fix: 'Run setup once (it creates every index), or npm run db:indexes from a shell.',
          },
    );
  } catch (error) {
    checks.push({ id: 'indexes', label: 'Indexes', status: 'fail', detail: describe(error) });
  }
  try {
    const owner = await usersRepo.findOwnerUser();
    const settings = await shopSettingsRepo.getShopSettings();
    checks.push(
      settings
        ? {
            id: 'seed',
            label: 'Shop data',
            status: 'pass',
            detail: 'Shop settings exist.',
          }
        : {
            id: 'seed',
            label: 'Shop data',
            status: 'fail',
            detail: 'There are no shop settings yet.',
            fix: 'Run setup once from /setup. It loads the services, chairs, hours and settings.',
          },
    );
    checks.push(
      owner
        ? { id: 'owner', label: 'Owner login', status: 'pass', detail: 'An owner login exists.' }
        : {
            id: 'owner',
            label: 'Owner login',
            status: 'fail',
            detail: 'There is no owner login.',
            fix: 'Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD, run setup, then remove SEED_OWNER_PASSWORD.',
          },
    );
  } catch (error) {
    checks.push({ id: 'seed', label: 'Shop data', status: 'fail', detail: describe(error) });
  }
  return checks;
}

const STORAGE_OFF_FIX = 'Set up Cloudflare R2 (see DEPLOY.md) to turn on photos and daily backups.';

/** Photo storage, its public address and the daily backups that go to the same bucket. */
async function checkStorage(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  if (getPartialEnv().STORAGE_DRIVER === 'none') {
    const detail = 'STORAGE_DRIVER is none: the site runs without photos for now.';
    return [
      { id: 'storage', label: 'Photo storage', status: 'warn', detail, fix: STORAGE_OFF_FIX },
      {
        id: 'storage-public',
        label: 'Public photo URL',
        status: 'warn',
        detail,
        fix: STORAGE_OFF_FIX,
      },
      {
        id: 'backups',
        label: 'Backups',
        status: 'warn',
        detail: 'Daily backups are off because there is no bucket to write them to.',
        fix: STORAGE_OFF_FIX,
      },
    ];
  }
  const key = `${keyPrefix()}_doctor/${randomUUID()}.txt`;
  const body = new TextEncoder().encode('exquisite doctor');
  let storage;
  try {
    storage = getStorage();
    await storage.put(key, body, 'text/plain');
    const head = await storage.head(key);
    if (head?.size !== body.length) throw new Error('the object did not read back');
    checks.push({
      id: 'storage',
      label: 'Photo storage',
      status: 'pass',
      detail: `A test object was written and read back with the ${storage.name} driver.`,
    });
  } catch (error) {
    checks.push({
      id: 'storage',
      label: 'Photo storage',
      status: 'fail',
      detail: describe(error),
      fix: 'Check the R2 account id, bucket name and API token (it needs Object Read and Write on this bucket).',
    });
    return checks;
  }
  try {
    const res = await fetch(storage.publicUrl(key));
    const text = res.ok ? await res.text() : '';
    checks.push(
      text === 'exquisite doctor'
        ? {
            id: 'storage-public',
            label: 'Public photo URL',
            status: 'pass',
            detail: 'The public address serves the test object.',
          }
        : {
            id: 'storage-public',
            label: 'Public photo URL',
            status: 'fail',
            detail: `The public address answered ${res.status}.`,
            fix: 'In Cloudflare R2, open the bucket, Settings, Public access, and connect a custom domain or enable the r2.dev address; set R2_PUBLIC_BASE_URL to it.',
          },
    );
  } catch (error) {
    checks.push({
      id: 'storage-public',
      label: 'Public photo URL',
      status: 'fail',
      detail: describe(error),
      fix: 'Set R2_PUBLIC_BASE_URL to the public address of the bucket (custom domain or r2.dev).',
    });
  } finally {
    await storage.delete(key).catch(() => undefined);
  }
  checks.push({
    id: 'backups',
    label: 'Backups',
    status: 'pass',
    detail:
      'The daily job writes every collection to the photo bucket under _backups/, 30 days kept.',
  });
  return checks;
}

async function checkEmail(fetchImpl: typeof fetch): Promise<DoctorCheck[]> {
  const env = getPartialEnv();
  if (env.EMAIL_PROVIDER !== 'resend') {
    return [
      {
        id: 'email',
        label: 'Email',
        status: currentEnvironment() === 'production' ? 'warn' : 'pass',
        detail: 'Emails are written to the log, not sent.',
        fix: 'When the domain is verified in Resend, set EMAIL_PROVIDER=resend, RESEND_API_KEY and EMAIL_FROM.',
      },
    ];
  }
  const from = env.EMAIL_FROM ?? '';
  const domain = /@([^>\s]+)/.exec(from)?.[1]?.toLowerCase() ?? '';
  try {
    const res = await fetchImpl('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY ?? ''}` },
    });
    if (res.status === 401 || res.status === 403) {
      return [
        {
          id: 'email',
          label: 'Email',
          status: 'fail',
          detail: 'Resend rejected the API key.',
          fix: 'Create a new API key in Resend (API Keys) and set RESEND_API_KEY.',
        },
      ];
    }
    const data = (await res.json()) as { data?: { name: string; status: string }[] };
    const match = (data.data ?? []).find((d) => d.name.toLowerCase() === domain);
    if (!match) {
      return [
        {
          id: 'email',
          label: 'Email',
          status: 'fail',
          detail: `The sender domain is not in the Resend account.`,
          fix: 'Add the domain in Resend (Domains), add its DNS records, and use that domain in EMAIL_FROM.',
        },
      ];
    }
    return [
      match.status === 'verified'
        ? {
            id: 'email',
            label: 'Email',
            status: 'pass',
            detail: 'Resend is set up and the sender domain is verified.',
          }
        : {
            id: 'email',
            label: 'Email',
            status: 'warn',
            detail: `The sender domain is ${match.status} in Resend.`,
            fix: 'Finish the DNS records in Resend (Domains) and wait for the domain to verify.',
          },
    ];
  } catch (error) {
    return [
      {
        id: 'email',
        label: 'Email',
        status: 'warn',
        detail: `Could not reach Resend: ${describe(error)}`,
      },
    ];
  }
}

function checkCron(): DoctorCheck {
  return getPartialEnv().CRON_SECRET
    ? { id: 'cron', label: 'Daily job', status: 'pass', detail: 'CRON_SECRET is set.' }
    : {
        id: 'cron',
        label: 'Daily job',
        status: 'fail',
        detail: 'CRON_SECRET is not set, so the daily backup and email job cannot run.',
        fix: 'Generate a random string of at least 32 characters and set CRON_SECRET.',
      };
}

/** Every check, safe to run as often as wanted. Never returns a value from the environment. */
export async function runDoctor(
  options: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<DoctorReport> {
  const now = options.now ?? new Date();
  const checks = [
    ...checkEnv(),
    ...(await checkDatabase()),
    ...(await checkStorage()),
    ...(await checkEmail(options.fetchImpl ?? fetch)),
    checkCron(),
  ];
  return {
    ok: checks.every((c) => c.status !== 'fail'),
    environment: currentEnvironment(),
    checkedAt: now.toISOString(),
    checks,
  };
}
