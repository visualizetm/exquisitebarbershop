import { getEnv } from '../env';
import { describeError, logger } from '../lib/logger';
import { emailOutboxRepo } from '../repos';
import type { EmailOutboxDocument } from '../../shared/schemas/emailOutbox';
import { getChannel } from './registry';
import { renderTemplate } from './templates';

export interface DeliverySummary {
  sent: number;
  failed: number;
  remaining: number;
}

/** Sends one claimed message and records the result. Never throws. */
async function sendClaimed(message: EmailOutboxDocument, now: Date): Promise<boolean> {
  try {
    const rendered = renderTemplate(message.template, message.payload, message.to, message._id, {
      appBaseUrl: getEnv().APP_BASE_URL,
      now,
    });
    const result = await getChannel(message.channel).send(rendered);
    if (result.ok) {
      await emailOutboxRepo.markOutboxSent(message._id, now);
      return true;
    }
    await emailOutboxRepo.markOutboxFailed(message._id, result.error, now, {
      retryable: result.retryable,
    });
    logger.warn('outbox send failed', {
      id: message._id,
      error: result.error,
      retryable: result.retryable,
    });
    return false;
  } catch (error) {
    // Rendering failures are bugs, not transient: park the message for the owner to see.
    await emailOutboxRepo.markOutboxFailed(
      message._id,
      describeError(error).message as string,
      now,
      { retryable: false },
    );
    logger.error('outbox render failed', { id: message._id, error: describeError(error) });
    return false;
  }
}

/** Delivers specific rows right after their transaction committed. Rows already claimed are skipped. */
export async function deliverOutboxIds(
  ids: readonly string[],
  now: Date = new Date(),
): Promise<DeliverySummary> {
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    const claimed = await emailOutboxRepo.claimOutboxMessageById(id, now);
    if (!claimed) continue;
    if (await sendClaimed(claimed, now)) sent += 1;
    else failed += 1;
  }
  return { sent, failed, remaining: 0 };
}

/** Drains the queue: everything due, up to a limit. Used by the cron backstop and the owner retry. */
export async function deliverPendingOutbox(
  options: { limit?: number; now?: Date } = {},
): Promise<DeliverySummary> {
  const limit = options.limit ?? 50;
  const now = options.now ?? new Date();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < limit; i += 1) {
    const claimed = await emailOutboxRepo.claimNextOutboxMessage(now);
    if (!claimed) break;
    if (await sendClaimed(claimed, now)) sent += 1;
    else failed += 1;
  }
  const remaining = (await emailOutboxRepo.listOutboxByStatus('pending', limit)).filter(
    (m) => m.nextAttemptAt.getTime() <= now.getTime(),
  ).length;
  return { sent, failed, remaining };
}
