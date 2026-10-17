import type { Filter } from 'mongodb';
import {
  bookingDocumentSchema,
  type BookingDocument,
  type BookingStatus,
} from '../../shared/schemas/booking';
import { collection } from '../db/collections';
import { AppError, isDuplicateKeyError } from '../lib/errors';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

export type BookingInput = Omit<BookingDocument, '_id' | 'createdAt' | 'updatedAt'>;

export class ReferenceCodeCollision extends Error {
  constructor(cause: unknown) {
    super('Reference code already exists', { cause });
    this.name = 'ReferenceCodeCollision';
  }
}

/** Inserts a booking. Throws ReferenceCodeCollision so the service can draw a new code and retry. */
export async function insertBooking(
  input: BookingInput,
  now: Date,
  options?: RepoOptions & { id?: string },
): Promise<BookingDocument> {
  const doc = bookingDocumentSchema.parse({
    _id: options?.id ?? newId(),
    ...input,
    createdAt: now,
    updatedAt: now,
  });
  const col = await collection('bookings');
  try {
    await col.insertOne(doc, sessionOf(options));
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new ReferenceCodeCollision(error);
    throw error;
  }
  return doc;
}

export async function findBookingById(
  id: string,
  options?: RepoOptions,
): Promise<BookingDocument | null> {
  const col = await collection('bookings');
  return col.findOne({ _id: id }, sessionOf(options));
}

export async function findBookingByReferenceCode(
  referenceCode: string,
  options?: RepoOptions,
): Promise<BookingDocument | null> {
  const col = await collection('bookings');
  return col.findOne({ referenceCode }, sessionOf(options));
}

export interface BookingRangeFilter {
  staffId?: string;
  statuses?: readonly BookingStatus[];
}

/** Bookings overlapping [start, end), optionally for one chair or a set of statuses. */
export async function listBookingsBetween(
  range: { start: Date; end: Date },
  filter: BookingRangeFilter = {},
  options?: RepoOptions,
): Promise<BookingDocument[]> {
  const col = await collection('bookings');
  const query: Filter<BookingDocument> = {
    startAt: { $lt: range.end },
    endAt: { $gt: range.start },
  };
  if (filter.staffId) query.staffId = filter.staffId;
  if (filter.statuses) query.status = { $in: [...filter.statuses] };
  return col.find(query, sessionOf(options)).sort({ startAt: 1 }).toArray();
}

/** Confirmed future bookings a phone number currently holds. */
export async function countOpenBookingsForPhone(
  phone: string,
  now: Date,
  options?: RepoOptions,
): Promise<number> {
  const col = await collection('bookings');
  return col.countDocuments(
    { 'customer.phone': phone, status: 'confirmed', startAt: { $gte: now } },
    sessionOf(options),
  );
}

export async function listBookingsForPhone(
  phone: string,
  limit: number,
  options?: RepoOptions,
): Promise<BookingDocument[]> {
  const col = await collection('bookings');
  return col
    .find({ 'customer.phone': phone }, sessionOf(options))
    .sort({ startAt: -1 })
    .limit(limit)
    .toArray();
}

export async function cancelBooking(
  id: string,
  cancellation: NonNullable<BookingDocument['cancellation']>,
  now: Date,
  options?: RepoOptions,
): Promise<BookingDocument> {
  const col = await collection('bookings');
  const updated = await col.findOneAndUpdate(
    { _id: id, status: 'confirmed' },
    {
      $set: { status: 'cancelled', cancellation, updatedAt: now },
      $inc: { manageTokenVersion: 1 },
    },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated)
    throw new AppError('BOOKING_NOT_CANCELLABLE', 'This booking can no longer be cancelled');
  return updated;
}

export async function setBookingStatus(
  id: string,
  status: Extract<BookingStatus, 'completed' | 'noShow' | 'confirmed'>,
  now: Date,
  options?: RepoOptions,
): Promise<BookingDocument> {
  const col = await collection('bookings');
  const updated = await col.findOneAndUpdate(
    { _id: id, status: { $ne: 'cancelled' } },
    { $set: { status, updatedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Booking was not found');
  return updated;
}

/** Moves a booking. Lock changes happen in the service, inside the same transaction. */
export async function rescheduleBooking(
  id: string,
  change: {
    staffId: string;
    staffRequested: boolean;
    startAt: Date;
    endAt: Date;
    bufferMinutes: number;
  },
  now: Date,
  options?: RepoOptions,
): Promise<BookingDocument> {
  const col = await collection('bookings');
  const updated = await col.findOneAndUpdate(
    { _id: id, status: 'confirmed' },
    { $set: { ...change, updatedAt: now }, $inc: { manageTokenVersion: 1 } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated)
    throw new AppError('BOOKING_NOT_RESCHEDULABLE', 'This booking can no longer be rescheduled');
  return updated;
}

export async function updateBookingNotes(
  id: string,
  notes: string | null,
  now: Date,
  options?: RepoOptions,
): Promise<BookingDocument> {
  const col = await collection('bookings');
  const updated = await col.findOneAndUpdate(
    { _id: id },
    { $set: { notes, updatedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated) throw new AppError('NOT_FOUND', 'Booking was not found');
  return updated;
}

/**
 * Moves a booking from one status to another only if it is still in `from`, so
 * two people acting at once cannot both succeed. Returns null when it was not.
 */
export async function transitionBookingStatus(
  id: string,
  from: BookingStatus,
  to: BookingStatus,
  now: Date,
  options?: RepoOptions,
): Promise<BookingDocument | null> {
  const col = await collection('bookings');
  return col.findOneAndUpdate(
    { _id: id, status: from },
    { $set: { status: to, updatedAt: now } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
}

/** Undoes a cancellation. The caller re-takes the slot locks in the same transaction. */
export async function restoreBooking(
  id: string,
  now: Date,
  options?: RepoOptions,
): Promise<BookingDocument | null> {
  const col = await collection('bookings');
  return col.findOneAndUpdate(
    { _id: id, status: 'cancelled' },
    {
      $set: { status: 'confirmed', cancellation: null, updatedAt: now },
      $inc: { manageTokenVersion: 1 },
    },
    { returnDocument: 'after', ...sessionOf(options) },
  );
}

/** Marks a booking as opened by the owner. First view wins. */
export async function markOwnerSeen(id: string, now: Date, options?: RepoOptions): Promise<void> {
  const col = await collection('bookings');
  await col.updateOne(
    { _id: id, $or: [{ ownerSeenAt: null }, { ownerSeenAt: { $exists: false } }] },
    { $set: { ownerSeenAt: now } },
    sessionOf(options),
  );
}

/** Online bookings, not cancelled, the owner has not opened. */
export async function countUnseenOnline(options?: RepoOptions): Promise<number> {
  const col = await collection('bookings');
  return col.countDocuments(
    {
      source: 'online',
      status: { $ne: 'cancelled' },
      $or: [{ ownerSeenAt: null }, { ownerSeenAt: { $exists: false } }],
    },
    sessionOf(options),
  );
}

/** Confirmed bookings that have not ended yet, optionally for some chairs only. */
export async function listUpcomingConfirmed(
  now: Date,
  staffIds: readonly string[] | null,
  options?: RepoOptions,
): Promise<BookingDocument[]> {
  const col = await collection('bookings');
  const query: Filter<BookingDocument> = { status: 'confirmed', endAt: { $gt: now } };
  if (staffIds) query.staffId = { $in: [...staffIds] };
  return col.find(query, sessionOf(options)).sort({ startAt: 1 }).toArray();
}

export interface BookingPageFilter {
  start?: Date;
  end?: Date;
  staffId?: string;
  status?: BookingStatus;
  source?: BookingDocument['source'];
  referenceCode?: string;
  phoneDigits?: string;
  name?: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A page of bookings ordered by start, then id, after an optional cursor position. */
export async function listBookingsPage(
  filter: BookingPageFilter,
  after: { startAt: Date; id: string } | null,
  limit: number,
  options?: RepoOptions,
): Promise<BookingDocument[]> {
  const col = await collection('bookings');
  const and: Filter<BookingDocument>[] = [];
  if (filter.start) and.push({ startAt: { $gte: filter.start } });
  if (filter.end) and.push({ startAt: { $lt: filter.end } });
  if (filter.staffId) and.push({ staffId: filter.staffId });
  if (filter.status) and.push({ status: filter.status });
  if (filter.source) and.push({ source: filter.source });
  if (filter.referenceCode) and.push({ referenceCode: filter.referenceCode });
  if (filter.phoneDigits)
    and.push({ 'customer.phone': { $regex: escapeRegex(filter.phoneDigits) } });
  if (filter.name)
    and.push({ 'customer.name': { $regex: escapeRegex(filter.name), $options: 'i' } });
  if (after) {
    and.push({
      $or: [
        { startAt: { $gt: after.startAt } },
        { startAt: after.startAt, _id: { $gt: after.id } },
      ],
    });
  }
  const query: Filter<BookingDocument> = and.length > 0 ? { $and: and } : {};
  return col.find(query, sessionOf(options)).sort({ startAt: 1, _id: 1 }).limit(limit).toArray();
}
