import type { ClientSession, TransactionOptions } from 'mongodb';
import { getMongoClient } from './client';
import { logger } from '../lib/logger';

export interface WithTransactionOptions {
  /** Attempts of the whole transaction when the driver reports a transient error. */
  maxRetries?: number;
  transaction?: TransactionOptions;
}

const DEFAULT_TX_OPTIONS: TransactionOptions = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  readPreference: 'primary',
};

function hasErrorLabel(error: unknown, label: string): boolean {
  if (typeof error !== 'object' || error === null || !('hasErrorLabel' in error)) return false;
  const candidate = error.hasErrorLabel;
  return (
    typeof candidate === 'function' && (candidate as (l: string) => boolean).call(error, label)
  );
}

export function isTransientTransactionError(error: unknown): boolean {
  return (
    hasErrorLabel(error, 'TransientTransactionError') ||
    hasErrorLabel(error, 'UnknownTransactionCommitResult')
  );
}

/**
 * Runs `fn` inside a transaction. The driver already retries transient errors
 * inside `session.withTransaction`; this adds a bounded outer retry for the case
 * where the driver gives up, and guarantees the session is always ended.
 *
 * `fn` must be idempotent within the transaction (it may run more than once) and
 * must pass `session` to every repository call. An exception from `fn` aborts the
 * transaction and is rethrown unchanged, so callers can map duplicate key errors to
 * SLOT_TAKEN or similar.
 */
export async function withTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
  options: WithTransactionOptions = {},
): Promise<T> {
  const client = await getMongoClient();
  const maxRetries = options.maxRetries ?? 3;
  const txOptions = { ...DEFAULT_TX_OPTIONS, ...options.transaction };
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const session = client.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await fn(session);
      }, txOptions);
      return result as T;
    } catch (error) {
      if (isTransientTransactionError(error) && attempt < maxRetries) {
        logger.warn('transient transaction error, retrying', { attempt });
        await new Promise((r) => setTimeout(r, 25 * attempt));
        continue;
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
