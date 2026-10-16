import { waitUntil } from '@vercel/functions';
import { describeError, logger } from './logger';

/**
 * Runs work after the response is sent without delaying it. On Vercel, waitUntil
 * keeps the function alive until the promise settles; elsewhere (local dev,
 * tests) waitUntil is a no-op and the promise simply runs in the background.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
  const promise = task().catch((error: unknown) => {
    logger.error('after-response task failed', { label, error: describeError(error) });
  });
  try {
    waitUntil(promise);
  } catch (error) {
    logger.debug('waitUntil unavailable', { label, error: describeError(error) });
  }
}
