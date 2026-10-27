import type { Filter } from 'mongodb';
import {
  bookingDocumentSchema,
  type BookingDocument,
  type BookingStatus,
} from '../../shared/schemas/booking';
import { nameKeyOf } from '../../shared/lib/search';
import { collection } from '../db/collections';
import { AppError, isDuplicateKeyError } from '../lib/errors';
import { newId } from '../lib/ids';
import { sessionOf, type RepoOptions } from './types';

/** The discounts list defaults to empty, so a walk-in or a fixture never has to name it. */
export type BookingInput = Omit<
  BookingDocument,
  '_id' | 'createdAt' | 'updatedAt' | 'discounts'
> & {
  discounts?: BookingDocument['discounts'];
};

export class ReferenceCodeCollision extends Error {
  constructor(cause: unknown) {
    super('Reference code already exists', { cause });
    this.name = 'ReferenceCodeCollision';
  }
}

/** Another booking for the same phone took the launch offer first (the unique partial index). */
export class LaunchOfferTaken extends Error {
  constructor() {
    super('The launch offer was already used by this phone');
  }
}

const OFFER_HOLDING_STATUSES: BookingStatus[] = ['confirmed', 'completed', 'noShow'];

/** Whether a phone already holds the launch offer on a booking that is booked, done or a no show. */
export async function launchOfferUsedByPhone(
  phone: string,
  options?: RepoOptions,
): Promise<boolean> {
  const col = await collection('bookings');
  const found = await col.findOne(
    {
      'customer.phone': phone,
      'discounts.code': 'LAUNCH10',
      status: { $in: OFFER_HOLDING_STATUSES },
    },
    { projection: { _id: 1 }, ...sessionOf(options) },
  );
  return found !== null;
}

/** How often the launch offer was given and what it took off, for the editor's count. */
export async function launchOfferUsage(): Promise<{ count: number; amountCents: number }> {
  const col = await collection('bookings');
  const rows = await col
    .aggregate<{ count: number; amountCents: number }>([
      { $match: { 'discounts.code': 'LAUNCH10', status: { $in: OFFER_HOLDING_STATUSES } } },
      { $unwind: '$discounts' },
      { $match: { 'discounts.code': 'LAUNCH10' } },
      {
        $group: { _id: null, count: { $sum: 1 }, amountCents: { $sum: '$discounts.amountCents' } },
      },
    ])
    .toArray();
  const row = rows[0];
  return row ? { count: row.count, amountCents: row.amountCents } : { count: 0, amountCents: 0 };
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
    nameKey: nameKeyOf(input.customer.name),
    createdAt: now,
    updatedAt: now,
  });
  const col = await collection('bookings');
  try {
    await col.insertOne(doc, sessionOf(options));
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      if (error instanceof Error && error.message.includes('launchOfferOncePerPhone')) {
        throw new LaunchOfferTaken();
      }
      throw new ReferenceCodeCollision(error);
    }
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

/**
 * Stamps Arrived or Start on a confirmed booking. Null when the booking is not confirmed or the
 * stamp is already there, so the service can answer the same way twice.
 */
export async function stampBookingMoment(
  id: string,
  field: 'arrivedAt' | 'startedAt',
  at: Date,
  options?: RepoOptions,
): Promise<BookingDocument | null> {
  const col = await collection('bookings');
  return col.findOneAndUpdate(
    { _id: id, status: 'confirmed', [field]: { $in: [null, undefined] } },
    { $set: { [field]: at, updatedAt: at } },
    { returnDocument: 'after', ...sessionOf(options) },
  );
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
    /** Only when the booking moves to a chair with other prices: the services as that chair does them. */
    services?: BookingDocument['services'];
    durationMinutes?: number;
    totalPriceCents?: number;
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
  /** Digits that also read as a reference code: match either one. */
  codeOrPhone?: { referenceCode: string; phoneDigits: string };
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
  if (filter.codeOrPhone) {
    and.push({
      $or: [
        { referenceCode: filter.codeOrPhone.referenceCode },
        { 'customer.phone': { $regex: escapeRegex(filter.codeOrPhone.phoneDigits) } },
      ],
    });
  }
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

// ---------------------------------------------------------------------------
// Owner search
// ---------------------------------------------------------------------------

/** One customer, as the search and the customer list see them: all bookings with one phone. */
export interface CustomerSummary {
  phone: string;
  name: string;
  visits: number;
  lastVisitAt: Date;
}

type SearchMatch = { kind: 'phone'; digits: string } | { kind: 'name'; key: string };

function matchFilter(match: SearchMatch): Filter<BookingDocument> {
  if (match.kind === 'name') return { nameKey: { $regex: `^${escapeRegex(match.key)}` } };
  // Ten digits are one exact phone; fewer match the end of the number (the last four are enough).
  return match.digits.length === 10
    ? { 'customer.phone': `+1${match.digits}` }
    : { 'customer.phone': { $regex: `${escapeRegex(match.digits)}$` } };
}

/** The newest bookings matching a name prefix or a phone, for the search dropdown. */
export async function searchBookings(
  match: SearchMatch,
  limit: number,
  options?: RepoOptions,
): Promise<BookingDocument[]> {
  const col = await collection('bookings');
  return col
    .find(matchFilter(match), sessionOf(options))
    .sort({ startAt: -1 })
    .limit(limit)
    .toArray();
}

/** Customers (grouped by phone) whose bookings match, most recent visit first. */
export async function searchCustomers(
  match: SearchMatch,
  limit: number,
  options?: RepoOptions,
): Promise<CustomerSummary[]> {
  return customerSummaries(matchFilter(match), limit, options);
}

async function customerSummaries(
  filter: Filter<BookingDocument>,
  limit: number,
  options?: RepoOptions,
  skip = 0,
): Promise<CustomerSummary[]> {
  const col = await collection('bookings');
  const rows = await col
    .aggregate<{ _id: string; name: string; visits: number; last: Date }>(
      [
        { $match: filter },
        { $sort: { startAt: -1 } },
        {
          $group: {
            _id: '$customer.phone',
            name: { $first: '$customer.name' },
            visits: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            last: { $max: '$startAt' },
          },
        },
        { $sort: { last: -1, _id: 1 } },
        { $skip: skip },
        { $limit: limit },
      ],
      sessionOf(options),
    )
    .toArray();
  return rows.map((r) => ({ phone: r._id, name: r.name, visits: r.visits, lastVisitAt: r.last }));
}

/** Backfills nameKey on bookings written before the field existed. Cheap when none are missing. */
export async function backfillNameKeys(): Promise<number> {
  const col = await collection('bookings');
  let total = 0;
  for (;;) {
    const batch = await col
      .find({ nameKey: { $exists: false } })
      .limit(500)
      .toArray();
    if (batch.length === 0) return total;
    await col.bulkWrite(
      batch.map((b) => ({
        updateOne: {
          filter: { _id: b._id },
          update: { $set: { nameKey: nameKeyOf(b.customer.name) } },
        },
      })),
    );
    total += batch.length;
  }
}

// ---------------------------------------------------------------------------
// Owner bookings table and overview
// ---------------------------------------------------------------------------

export interface TableFilter {
  /** Start time bounds: from inclusive, to exclusive. */
  from?: Date;
  to?: Date;
  staffId?: string;
  status?: BookingStatus;
}

function tableQuery(filter: TableFilter): Filter<BookingDocument> {
  const query: Filter<BookingDocument> = {};
  if (filter.from || filter.to) {
    query.startAt = {
      ...(filter.from ? { $gte: filter.from } : {}),
      ...(filter.to ? { $lt: filter.to } : {}),
    };
  }
  if (filter.staffId) query.staffId = filter.staffId;
  if (filter.status) query.status = filter.status;
  return query;
}

export type TableSortKey = 'when' | 'client' | 'status' | 'source';

/** One page of the owner's bookings table: stable order, the chosen column first. */
export async function tablePage(
  filter: TableFilter,
  sort: { key: TableSortKey; dir: 1 | -1 },
  skip: number,
  limit: number,
  options?: RepoOptions,
): Promise<BookingDocument[]> {
  const col = await collection('bookings');
  const first: Record<TableSortKey, string> = {
    when: 'startAt',
    client: 'nameKey',
    status: 'status',
    source: 'source',
  };
  const order: Record<string, 1 | -1> = { [first[sort.key]]: sort.dir };
  if (sort.key !== 'when') order.startAt = -1;
  order._id = 1;
  return col
    .find(tableQuery(filter), sessionOf(options))
    .sort(order)
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function countTable(filter: TableFilter, options?: RepoOptions): Promise<number> {
  const col = await collection('bookings');
  return col.countDocuments(tableQuery(filter), sessionOf(options));
}

export async function findBookingsByIds(
  ids: readonly string[],
  options?: RepoOptions,
): Promise<BookingDocument[]> {
  if (ids.length === 0) return [];
  const col = await collection('bookings');
  return col.find({ _id: { $in: [...ids] } }, sessionOf(options)).toArray();
}

/** Bookings that start in [start, end), any status, for the weekly counts. */
export async function listBookingsStartingBetween(
  range: { start: Date; end: Date },
  options?: RepoOptions,
): Promise<BookingDocument[]> {
  const col = await collection('bookings');
  return col
    .find({ startAt: { $gte: range.start, $lt: range.end } }, sessionOf(options))
    .sort({ startAt: 1 })
    .toArray();
}

/**
 * Gives a confirmed booking to another chair at the same start, with that chair's price and length
 * (the end follows it). Lock changes happen in the service, inside the same transaction. The
 * customer is emailed the change, so the manage link version moves up like a reschedule: the
 * newest email holds the working link, and the calendar file's SEQUENCE rises so a calendar replaces
 * the old event.
 */
export async function moveBookingToStaff(
  id: string,
  change: {
    staffId: string;
    endAt: Date;
    services: BookingDocument['services'];
    durationMinutes: number;
    totalPriceCents: number;
  },
  now: Date,
  options?: RepoOptions,
): Promise<BookingDocument> {
  const col = await collection('bookings');
  const updated = await col.findOneAndUpdate(
    { _id: id, status: 'confirmed' },
    {
      $set: { ...change, staffRequested: true, updatedAt: now },
      $inc: { manageTokenVersion: 1 },
    },
    { returnDocument: 'after', ...sessionOf(options) },
  );
  if (!updated)
    throw new AppError('BOOKING_NOT_RESCHEDULABLE', 'This booking can no longer be moved');
  return updated;
}

// ---------------------------------------------------------------------------
// Customer list (customers are everyone who booked with one phone number)
// ---------------------------------------------------------------------------

export interface CustomerRow {
  phone: string;
  name: string;
  bookings: number;
  visits: number;
  noShows: number;
  lastVisitAt: Date | null;
  usualStaffId: string | null;
}

export type CustomerSortKey = 'name' | 'visits' | 'last' | 'noShows';

/** One page of customers, grouped from bookings, with the totals the list shows. */
export async function customerPage(
  match: SearchMatch | null,
  sort: { key: CustomerSortKey; dir: 1 | -1 },
  skip: number,
  limit: number,
  options?: RepoOptions,
): Promise<{ rows: CustomerRow[]; total: number }> {
  const col = await collection('bookings');
  const sortField: Record<CustomerSortKey, string> = {
    name: 'nameKey',
    visits: 'visits',
    last: 'lastVisit',
    noShows: 'noShows',
  };
  const [result] = await col
    .aggregate<{
      rows: {
        _id: string;
        name: string;
        bookings: number;
        visits: number;
        noShows: number;
        lastVisit: Date | null;
        staff: { id: string; gone: boolean }[];
      }[];
      total: { n: number }[];
    }>(
      [
        ...(match ? [{ $match: matchFilter(match) }] : []),
        { $sort: { startAt: -1 } },
        {
          $group: {
            _id: '$customer.phone',
            name: { $first: '$customer.name' },
            nameKey: { $first: '$nameKey' },
            bookings: { $sum: 1 },
            visits: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            noShows: { $sum: { $cond: [{ $eq: ['$status', 'noShow'] }, 1, 0] } },
            lastVisit: { $max: { $cond: [{ $eq: ['$status', 'completed'] }, '$startAt', null] } },
            staff: { $push: { id: '$staffId', gone: { $eq: ['$status', 'cancelled'] } } },
          },
        },
        {
          $facet: {
            rows: [
              { $sort: { [sortField[sort.key]]: sort.dir, _id: 1 } },
              { $skip: skip },
              { $limit: limit },
            ],
            total: [{ $count: 'n' }],
          },
        },
      ],
      sessionOf(options),
    )
    .toArray();
  const rows = (result?.rows ?? []).map((r) => {
    const counts = new Map<string, number>();
    for (const s of r.staff) if (!s.gone) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
    const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      phone: r._id,
      name: r.name,
      bookings: r.bookings,
      visits: r.visits,
      noShows: r.noShows,
      lastVisitAt: r.lastVisit,
      usualStaffId: usual?.[0] ?? null,
    };
  });
  return { rows, total: result?.total[0]?.n ?? 0 };
}
