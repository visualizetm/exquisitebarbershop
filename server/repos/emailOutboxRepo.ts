import {
  emailOutboxDocumentSchema,
  type EmailOutboxDocument,
} from '../../shared/schemas/emailOutbox';
import { collection } from '../db/collections';
import { isDuplicateKeyError } from '../lib/errors';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export interface OutboxMessageInput {
  channel: EmailOutboxDocument['channel'];
  to: string;
  template: EmailOutboxDocument['template'];
  payload: Record<string, unknown>;
  dedupeKey: string | null;
  bookingId: string | null;
  maxAttempts?: number;
}

/**
 * Enqueues a message. Call it inside the transaction of the event it announces so
 * a booking and its confirmation are committed together or not at all. Returns
 * null when a message with the same dedupeKey already exists.
 */
export async function enqueueOutboxMessage(
  input: OutboxMessageInput,
  now: Date,
  options?: RepoOptions,
): Promise<EmailOutboxDocument | null> {
  const doc = emailOutboxDocumentSchema.parse({
    _id: newId(),
    channel: input.channel,
    to: input.to,
    template: input.template,
    payload: input.payload,
    status: 'pending',
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 5,
    lastError: null,
    nextAttemptAt: now,
    sentAt: null,
    dedupeKey: input.dedupeKey,
    bookingId: input.bookingId,
    createdAt: now,
    updatedAt: now,
  });
  const col = await collection('emailOutbox');
  // Inside a transaction a duplicate key aborts the whole transaction, so the
  // dedupe check happens up front; the unique index still guards a true race.
  if (doc.dedupeKey !== null) {
    const existing = await col.findOne({ dedupeKey: doc.dedupeKey }, sessionOf(options));
    if (existing) return null;
  }
  try {
    await col.insertOne(doc, sessionOf(options));
  } catch (error) {
    if (isDuplicateKeyError(error) && !options?.session) return null;
    throw error;
  }
  return doc;
}

/** A message stuck in "sending" longer than this is treated as abandoned and retried. */
export const STALE_SENDING_MS = 10 * 60_000;

/**
 * Atomically claims one due message by flipping it to "sending". Two deliverers
 * running at once can never pick the same message. A message left in "sending"
 * by a crashed process is reclaimed once it goes stale.
 */
export async function claimNextOutboxMessage(
  now: Date,
  options?: RepoOptions,
): Promise<EmailOutboxDocument | null> {
  const col = await collection('emailOutbox');
  return col.findOneAndUpdate(
    {
      $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } },
        { status: 'sending', updatedAt: { $lte: new Date(now.getTime() - STALE_SENDING_MS) } },
      ],
    },
    { $set: { status: 'sending', updatedAt: now }, $inc: { attempts: 1 } },
    { sort: { nextAttemptAt: 1 }, returnDocument: 'after', ...sessionOf(options) },
  );
}

/** Claims one specific pending message, for delivery right after its transaction commits. */
export async function claimOutboxMessageById(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<EmailOutboxDocument | null> {
  const col = await collection('emailOutbox');
  return col.findOneAndUpdate(
    { _id: id, status: 'pending', nextAttemptAt: { $lte: now } },
    { $set: { status: 'sending', updatedAt: now }, $inc: { attempts: 1 } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
}

export async function markOutboxSent(id: string, now: Date, options?: RepoOptions): Promise<void> {
  const col = await collection('emailOutbox');
  await col.updateOne(
    { _id: id },
    { $set: { status: 'sent', sentAt: now, lastError: null, updatedAt: now } },
    sessionOf(options),
  );
}

/**
 * Records a failure. Retryable failures back off exponentially until maxAttempts;
 * a non-retryable failure (bad address, rejected content) parks the message at once.
 */
export async function markOutboxFailed(
  id: string,
  error: string,
  now: Date,
  options?: RepoOptions & { retryable?: boolean },
): Promise<EmailOutboxDocument | null> {
  const col = await collection('emailOutbox');
  const current = await col.findOne({ _id: id }, sessionOf(options));
  if (!current) return null;
  const retryable = options?.retryable ?? true;
  const exhausted = !retryable || current.attempts >= current.maxAttempts;
  const backoffMinutes = Math.min(2 ** current.attempts, 60);
  return col.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        status: exhausted ? 'failed' : 'pending',
        lastError: error.slice(0, 1000),
        nextAttemptAt: new Date(now.getTime() + backoffMinutes * 60_000),
        updatedAt: now,
      },
    },
    { returnDocument: 'after', ...sessionOf(options) },
  );
}

/** Puts a failed message back in the queue (owner "retry" button). */
export async function requeueOutboxMessage(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<boolean> {
  const col = await collection('emailOutbox');
  const result = await col.updateOne(
    { _id: id, status: 'failed' },
    { $set: { status: 'pending', attempts: 0, nextAttemptAt: now, updatedAt: now } },
    sessionOf(options),
  );
  return result.modifiedCount === 1;
}

export async function listOutboxForBooking(
  bookingId: string,
  options?: RepoOptions,
): Promise<EmailOutboxDocument[]> {
  const col = await collection('emailOutbox');
  return col.find({ bookingId }, sessionOf(options)).sort({ createdAt: -1 }).toArray();
}

export async function listOutboxByStatus(
  status: EmailOutboxDocument['status'],
  limit = 100,
  options?: RepoOptions,
): Promise<EmailOutboxDocument[]> {
  const col = await collection('emailOutbox');
  return col.find({ status }, sessionOf(options)).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function findOutboxMessageById(
  id: string,
  options?: RepoOptions,
): Promise<EmailOutboxDocument | null> {
  const col = await collection('emailOutbox');
  return col.findOne({ _id: id }, sessionOf(options));
}

/** Newest first, optionally one status, after an optional cursor position. */
export async function listOutboxPage(
  status: EmailOutboxDocument['status'] | undefined,
  before: { createdAt: Date; id: string } | null,
  limit: number,
  options?: RepoOptions,
): Promise<EmailOutboxDocument[]> {
  const col = await collection('emailOutbox');
  const and: Record<string, unknown>[] = [];
  if (status) and.push({ status });
  if (before) {
    and.push({
      $or: [
        { createdAt: { $lt: before.createdAt } },
        { createdAt: before.createdAt, _id: { $lt: before.id } },
      ],
    });
  }
  const query = and.length > 0 ? { $and: and } : {};
  return col
    .find(query, sessionOf(options))
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
}
