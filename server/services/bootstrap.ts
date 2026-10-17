import type { Actor } from '../../shared/schemas/timeBlock';
import { getDb } from '../db/client';
import { getEnv } from '../env';
import { AppError } from '../lib/errors';
import { auditLogRepo, systemStateRepo } from '../repos';
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
 */
export async function bootstrap(
  input: { force: boolean; requestId: string | null },
  now: Date,
): Promise<BootstrapResult> {
  const previous = await systemStateRepo.getBootstrapRecord();
  if (previous && !input.force) {
    throw new AppError('CONFLICT', 'Setup already ran. Send force=true to run it again.', {
      extra: { completedAt: previous.completedAt.toISOString(), runs: previous.runs },
    });
  }
  const env = getEnv();
  let summary;
  try {
    summary = await runSeed(await getDb(), now, {
      ownerEmail: env.SEED_OWNER_EMAIL ?? null,
      ownerPassword: env.SEED_OWNER_PASSWORD ?? null,
    });
  } catch (error) {
    // A weak SEED_OWNER_PASSWORD is the one expected failure; it is the caller's to fix.
    if (error instanceof Error && error.message.startsWith('SEED_OWNER_PASSWORD')) {
      throw new AppError('BAD_REQUEST', error.message);
    }
    throw error;
  }
  const created = { ...summary, indexes: true };
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
