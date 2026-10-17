import { getEnv } from '../env';
import { runAfterResponse } from '../lib/afterResponse';
import { deliverOutboxIds } from '../notifications/deliver';

/** Emails go out right after the response unless tests asked to drive delivery by hand. */
export function scheduleDelivery(outboxIds: readonly string[]): void {
  if (outboxIds.length === 0 || getEnv().OUTBOX_AFTER_RESPONSE === 'off') return;
  runAfterResponse('outbox.deliver', () => deliverOutboxIds(outboxIds));
}
