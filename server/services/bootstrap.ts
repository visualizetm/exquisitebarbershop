import type { Actor } from '../../shared/schemas/timeBlock';
import { generateTemporaryPassword } from '../auth/password';
import { getDb } from '../db/client';
import { getEnv } from '../env';
import { AppError } from '../lib/errors';
import { auditLogRepo, systemStateRepo } from '../repos';
import { ensureDemoReady, resetDemoData, seedSampleBookings } from './demo';
import { runSeed } from './seedService';

const SYSTEM: Actor = { type: 'system', userId: null, staffId: null };

export interface BootstrapResult {
  firstRun: boolean;
  runs: number;
  created: Record<string, boolean | number | string>;
}

/**
 * The first setup without a shell: indexes, the idempotent seed and the owner
 * login from SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD when no owner exists.
 * Runs once; a second call needs force=true. Every run is audited.
 *
 * In demo mode the same code also loads the sample bookings and, when no owner
 * password was given, creates the owner with a random one nobody needs: the demo
 * sign-in button opens the dashboard without it. A database the demo seeded is
 * refused once demo mode is off, until "Clear demo data" has emptied it.
 */
export async function bootstrap(
  input: { force: boolean; requestId: string | null },
  now: Date,
): Promise<BootstrapResult> {
  const env = getEnv();
  const demo = env.DEMO_MODE === 'true';
  const demoRecord = await systemStateRepo.getDemoRecord();
  if (demoRecord && !demo) {
    throw new AppError(
      'CONFLICT',
      'This database still holds demo data. Use "Clear demo data" first, then run setup.',
    );
  }
  const previous = await systemStateRepo.getBootstrapRecord();
  if (previous && !input.force) {
    throw new AppError('CONFLICT', 'Setup already ran. Send force=true to run it again.', {
      extra: { completedAt: previous.completedAt.toISOString(), runs: previous.runs },
    });
  }
  let summary;
  try {
    summary = await runSeed(await getDb(), now, {
      ownerEmail: env.SEED_OWNER_EMAIL ?? null,
      ownerPassword: env.SEED_OWNER_PASSWORD ?? (demo ? generateTemporaryPassword() : null),
    });
  } catch (error) {
    // A weak SEED_OWNER_PASSWORD is the one expected failure; it is the caller's to fix.
    if (error instanceof Error && error.message.startsWith('SEED_OWNER_PASSWORD')) {
      throw new AppError('BAD_REQUEST', error.message);
    }
    throw error;
  }
  const created: Record<string, boolean | number | string> = { ...summary, indexes: true };
  if (demo && !demoRecord) {
    created.sampleBookings = await seedSampleBookings(now);
    await systemStateRepo.recordDemoSeed(now);
    created.demo = true;
  }
  const record = await systemStateRepo.recordBootstrap(created, now);
  await auditLogRepo.appendAuditEntry(
    {
      actor: SYSTEM,
      action: 'system.bootstrap',
      entityType: 'system',
      entityId: 'bootstrap',
      before: previous ? { runs: previous.runs } : null,
      after: { runs: record.runs, force: input.force },
      meta: created,
      requestId: input.requestId,
    },
    now,
  );
  return { firstRun: previous === null, runs: record.runs, created };
}

const setupDemo = (now: Date) => bootstrap({ force: true, requestId: null }, now);

/** Demo mode: sets a fresh deployment up on its first request. No-op otherwise. */
export function ensureDemo(now?: Date): Promise<void> {
  return ensureDemoReady(setupDemo, now);
}

/** Demo mode: "Reset demo data". */
export function resetDemo(now: Date): Promise<void> {
  return resetDemoData(setupDemo, now);
}
