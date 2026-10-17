import type {
  AdminBookingView,
  BookingDetailResponse,
  BookingListQuery,
  CustomerResponse,
  MyScheduleResponse,
  ScheduleResponse,
  TodayResponse,
  WhoIsInEntry,
} from '../../shared/api/admin';
import { formatUsPhone, normalizeUsPhone } from '../../shared/lib/phone';
import { normalizeReferenceCode } from '../../shared/lib/referenceCode';
import { addMinutes, shopDateOf, shopDayBounds, shopDayStart } from '../../shared/lib/time';
import type { BookingDocument, BookingStatus } from '../../shared/schemas/booking';
import type { StaffDocument } from '../../shared/schemas/staff';
import { withTransaction } from '../db/transaction';
import type { Principal } from '../http/types';
import { AppError } from '../lib/errors';
import {
  auditLogRepo,
  bookingsRepo,
  emailOutboxRepo,
  scheduleGuardsRepo,
  shopSettingsRepo,
  slotLocksRepo,
  staffRepo,
} from '../repos';
import { assertInScope, actorOf, type Scope } from './access';
import { workingRangesFor, type ScheduleSource } from './availability';
import { enqueueBookingNotifications } from './bookingNotifications';
import {
  cancelInTransaction,
  manageLinkFor,
  rescheduleBookingAs,
  rescheduleStart,
} from './bookingService';
import {
  toAdminBookingView,
  toBookingView,
  toStaffRef,
  toTimeBlockView,
  unknownStaff,
} from './bookingView';
import { loadScheduleData } from './scheduleData';
import { toAuditView, toOutboxView } from './views';

export interface ServiceMeta {
  requestId: string;
  now: Date;
}

export interface Changed<T> {
  body: T;
  outboxIds: string[];
}

// ---------------------------------------------------------------------------
// Status rules
// ---------------------------------------------------------------------------

/** Every move the owner may make. Each forward move has an undo back to confirmed. */
const OWNER_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  confirmed: ['completed', 'noShow', 'cancelled'],
  completed: ['confirmed'],
  noShow: ['confirmed'],
  cancelled: ['confirmed'],
};

/** Barbers mark their own clients done or absent, and can undo that. They never cancel. */
const BARBER_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  confirmed: ['completed', 'noShow'],
  completed: ['confirmed'],
  noShow: ['confirmed'],
  cancelled: [],
};

export function allowedTransitions(
  principal: Principal,
  scope: Scope,
  from: BookingStatus,
): BookingStatus[] {
  const table =
    principal.role === 'owner' && scope.kind === 'all' ? OWNER_TRANSITIONS : BARBER_TRANSITIONS;
  return [...table[from]];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function staffName(staffById: Map<string, StaffDocument>, id: string) {
  return staffById.get(id) ?? unknownStaff(id);
}

function rangeViews(ranges: { start: Date; end: Date }[]) {
  return ranges.map((r) => ({ startAt: r.start.toISOString(), endAt: r.end.toISOString() }));
}

function workingView(staffId: string, date: string, source: ScheduleSource) {
  const day = workingRangesFor(staffId, date, source);
  return { ranges: rangeViews(day.ranges), reason: day.reason };
}

function whoIsInFor(staff: StaffDocument, date: string, source: ScheduleSource): WhoIsInEntry {
  const working = workingRangesFor(staff._id, date, source);
  const bounds = shopDayBounds(date);
  const blocks = source.timeBlocks.filter(
    (b) => b.staffId === staff._id && b.startAt < bounds.end && b.endAt > bounds.start,
  );
  return {
    staff: toStaffRef(staff),
    status: working.reason === 'closed' ? 'closed' : working.ranges.length > 0 ? 'in' : 'out',
    working: { ranges: rangeViews(working.ranges), reason: working.reason },
    dayOff: blocks.some((b) => b.kind === 'dayOff'),
    extraHours: blocks.some((b) => b.kind === 'extraHours'),
  };
}

async function loadBookingInScope(scope: Scope, id: string): Promise<BookingDocument> {
  const booking = await bookingsRepo.findBookingById(id);
  if (!booking) throw new AppError('NOT_FOUND', 'Booking was not found');
  assertInScope(scope, booking.staffId);
  return booking;
}

async function viewOf(booking: BookingDocument): Promise<AdminBookingView> {
  const staff = await staffRepo.findStaffById(booking.staffId);
  return toAdminBookingView(booking, staff ?? unknownStaff(booking.staffId));
}

function activeStaff(staff: StaffDocument[]): StaffDocument[] {
  return staff.filter((s) => s.deletedAt === null).sort((a, b) => a.sortOrder - b.sortOrder);
}

// ---------------------------------------------------------------------------
// Today, schedule, who is in
// ---------------------------------------------------------------------------

export async function todaySummary(date: string | undefined, now: Date): Promise<TodayResponse> {
  const day = date ?? shopDateOf(now);
  const [data, bookings, newOnline] = await Promise.all([
    loadScheduleData(day, day),
    bookingsRepo.listBookingsBetween(shopDayBounds(day)),
    bookingsRepo.countUnseenOnline(),
  ]);
  const live = bookings.filter((b) => b.status !== 'cancelled');
  const count = (status: BookingStatus) => bookings.filter((b) => b.status === status).length;
  const whoIsIn = activeStaff(data.staff).map((s) => whoIsInFor(s, day, data.source));
  const isToday = day === shopDateOf(now);
  const nextUp = activeStaff(data.staff)
    .filter(
      (s) =>
        live.some((b) => b.staffId === s._id) ||
        whoIsIn.some((w) => w.staff.id === s._id && w.status === 'in'),
    )
    .map((s) => {
      const next = live
        .filter(
          (b) => b.staffId === s._id && b.status === 'confirmed' && (!isToday || b.endAt > now),
        )
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
      return { staff: toStaffRef(s), booking: next ? toAdminBookingView(next, s) : null };
    });
  return {
    date: day,
    now: now.toISOString(),
    counts: {
      total: bookings.length,
      confirmed: count('confirmed'),
      completed: count('completed'),
      noShow: count('noShow'),
      cancelled: count('cancelled'),
      newOnline,
    },
    chairsBooked: new Set(live.map((b) => b.staffId)).size,
    chairsWorking: whoIsIn.filter((w) => w.status === 'in').length,
    expectedRevenueCents: live
      .filter((b) => b.status === 'confirmed' || b.status === 'completed')
      .reduce((sum, b) => sum + b.totalPriceCents, 0),
    completedRevenueCents: live
      .filter((b) => b.status === 'completed')
      .reduce((sum, b) => sum + b.totalPriceCents, 0),
    nextUp,
    whoIsIn,
  };
}

export async function scheduleForDay(
  scope: Scope,
  input: { date?: string | undefined; staffId?: string | undefined },
  now: Date,
): Promise<ScheduleResponse> {
  const day = input.date ?? shopDateOf(now);
  const only = scope.kind === 'chair' ? scope.staffId : input.staffId;
  const [data, bookings] = await Promise.all([
    loadScheduleData(day, day),
    bookingsRepo.listBookingsBetween(shopDayBounds(day), only ? { staffId: only } : {}),
  ]);
  const chairs = activeStaff(data.staff).filter((s) => !only || s._id === only);
  if (only && chairs.length === 0) throw new AppError('NOT_FOUND', 'That chair was not found');
  const bounds = shopDayBounds(day);
  return {
    date: day,
    chairs: chairs.map((s) => ({
      staff: toStaffRef(s),
      working: workingView(s._id, day, data.source),
      bookings: bookings.filter((b) => b.staffId === s._id).map((b) => toAdminBookingView(b, s)),
      blocks: data.source.timeBlocks
        .filter((b) => b.staffId === s._id && b.startAt < bounds.end && b.endAt > bounds.start)
        .map(toTimeBlockView),
    })),
  };
}

export async function whoIsIn(
  date: string | undefined,
  now: Date,
): Promise<{ date: string; entries: WhoIsInEntry[] }> {
  const day = date ?? shopDateOf(now);
  const data = await loadScheduleData(day, day);
  return {
    date: day,
    entries: activeStaff(data.staff).map((s) => whoIsInFor(s, day, data.source)),
  };
}

/** Whether one chair is in on a day, after a change. */
export async function whoIsInForStaff(staffId: string, date: string): Promise<WhoIsInEntry> {
  const data = await loadScheduleData(date, date);
  const staff = data.staff.find((s) => s._id === staffId);
  if (!staff) throw new AppError('NOT_FOUND', 'Staff member was not found');
  return whoIsInFor(staff, date, data.source);
}

/** The barber's own schedule for one to seven days. */
export async function mySchedule(
  scope: Scope & { kind: 'chair' },
  input: { date?: string | undefined; days: number },
  now: Date,
): Promise<MyScheduleResponse> {
  const from = input.date ?? shopDateOf(now);
  const to =
    shopDayStart(from)
      .plus({ days: input.days - 1 })
      .toISODate() ?? from;
  const range = { start: shopDayBounds(from).start, end: shopDayBounds(to).end };
  const [data, bookings, settings] = await Promise.all([
    loadScheduleData(from, to),
    bookingsRepo.listBookingsBetween(range, { staffId: scope.staffId }),
    shopSettingsRepo.requireShopSettings(),
  ]);
  const staff = data.staff.find((s) => s._id === scope.staffId);
  if (!staff || staff.deletedAt)
    throw new AppError('FORBIDDEN', 'This login is not linked to a chair');
  const days: MyScheduleResponse['days'] = [];
  for (let d = shopDayStart(from); (d.toISODate() ?? '') <= to; d = d.plus({ days: 1 })) {
    const date = d.toISODate() ?? from;
    const bounds = shopDayBounds(date);
    days.push({
      date,
      working: workingView(staff._id, date, data.source),
      bookings: bookings
        .filter((b) => b.startAt >= bounds.start && b.startAt < bounds.end)
        .map((b) => toAdminBookingView(b, staff)),
      blocks: data.source.timeBlocks
        .filter((b) => b.staffId === staff._id && b.startAt < bounds.end && b.endAt > bounds.start)
        .map(toTimeBlockView),
    });
  }
  return { staff: toStaffRef(staff), days, canBlockTime: settings.permissions.barbersCanBlockTime };
}

// ---------------------------------------------------------------------------
// Booking list and detail
// ---------------------------------------------------------------------------

function encodeCursor(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor<T>(cursor: string | undefined, check: (v: unknown) => v is T): T | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (check(parsed)) return parsed;
  } catch {
    // fall through
  }
  throw new AppError('VALIDATION_ERROR', 'The page cursor is not valid', {
    details: [{ path: 'cursor', message: 'Invalid cursor' }],
  });
}

function isTimeCursor(v: unknown): v is { t: number; i: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { t?: unknown }).t === 'number' &&
    typeof (v as { i?: unknown }).i === 'string'
  );
}

export const cursors = { encode: encodeCursor, decode: decodeCursor, isTimeCursor };

export async function listBookings(
  scope: Scope,
  query: BookingListQuery,
): Promise<{ bookings: AdminBookingView[]; nextCursor: string | null }> {
  const filter: bookingsRepo.BookingPageFilter = {};
  if (query.from) filter.start = shopDayBounds(query.from).start;
  if (query.to) filter.end = shopDayBounds(query.to).end;
  if (scope.kind === 'chair') filter.staffId = scope.staffId;
  else if (query.staffId) filter.staffId = query.staffId;
  if (query.status) filter.status = query.status;
  if (query.source) filter.source = query.source;
  const q = query.q?.trim();
  if (q) {
    const code = normalizeReferenceCode(q);
    const digits = q.replace(/\D/g, '');
    if (code) filter.referenceCode = code;
    else if (digits.length >= 4 && digits.length === q.replace(/[\s()+.-]/g, '').length)
      filter.phoneDigits = digits;
    else filter.name = q;
  }
  const after = decodeCursor(query.cursor, isTimeCursor);
  const page = await bookingsRepo.listBookingsPage(
    filter,
    after ? { startAt: new Date(after.t), id: after.i } : null,
    query.limit + 1,
  );
  const staffById = new Map(
    (await staffRepo.listStaff({ includeDeleted: true })).map((s) => [s._id, s]),
  );
  const visible = page.slice(0, query.limit);
  const last = visible[visible.length - 1];
  return {
    bookings: visible.map((b) => toAdminBookingView(b, staffName(staffById, b.staffId))),
    nextCursor:
      page.length > query.limit && last
        ? encodeCursor({ t: last.startAt.getTime(), i: last._id })
        : null,
  };
}

export async function bookingDetail(
  principal: Principal,
  scope: Scope,
  id: string,
  now: Date,
): Promise<BookingDetailResponse> {
  const booking = await loadBookingInScope(scope, id);
  if (scope.kind === 'all') await bookingsRepo.markOwnerSeen(booking._id, now);
  const fresh = (await bookingsRepo.findBookingById(booking._id)) ?? booking;
  const [audit, outbox] =
    scope.kind === 'all'
      ? await Promise.all([
          auditLogRepo.listAuditForEntity('booking', booking._id, 50),
          emailOutboxRepo.listOutboxForBooking(booking._id),
        ])
      : [[], []];
  return {
    booking: await viewOf(fresh),
    audit: audit.map(toAuditView),
    outbox: outbox.map(toOutboxView),
    transitions: allowedTransitions(principal, scope, fresh.status),
  };
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

/**
 * Moves a booking between statuses along the allowed paths only. Cancelling goes
 * through the shared cancel core; restoring a cancelled booking re-takes its slot
 * locks and fails with SLOT_TAKEN if someone else has the time now.
 */
export async function changeBookingStatus(
  principal: Principal,
  scope: Scope,
  id: string,
  input: { status: BookingStatus; notify: boolean; reason?: string | undefined },
  meta: ServiceMeta,
): Promise<Changed<{ booking: AdminBookingView }>> {
  const booking = await loadBookingInScope(scope, id);
  const to = input.status;
  if (!allowedTransitions(principal, scope, booking.status).includes(to)) {
    throw new AppError('INVALID_TRANSITION', `A ${booking.status} booking cannot become ${to}`);
  }
  const actor = actorOf(principal);
  const settings = await shopSettingsRepo.requireShopSettings();
  const staff = (await staffRepo.findStaffById(booking.staffId)) ?? unknownStaff(booking.staffId);
  const reason = input.reason?.trim() ? input.reason.trim() : null;

  if (to === 'cancelled') {
    const done = await withTransaction((session) =>
      cancelInTransaction(
        booking,
        staff,
        settings,
        {
          actor,
          reason,
          audience: { customer: input.notify, owner: false },
          requestId: meta.requestId,
        },
        meta.now,
        session,
      ),
    );
    return {
      body: { booking: toAdminBookingView(done.cancelled, staff) },
      outboxIds: done.outboxIds,
    };
  }

  if (booking.status === 'cancelled') {
    const done = await withTransaction(async (session) => {
      await scheduleGuardsRepo.bumpScheduleGuards([booking.staffId], meta.now, { session });
      const restored = await bookingsRepo.restoreBooking(booking._id, meta.now, { session });
      if (!restored)
        throw new AppError('INVALID_TRANSITION', 'This booking is no longer cancelled');
      try {
        await slotLocksRepo.acquireSlotLocks(
          restored.staffId,
          { start: restored.startAt, end: addMinutes(restored.endAt, restored.bufferMinutes) },
          { holderType: 'booking', holderId: restored._id },
          meta.now,
          { session },
        );
      } catch (error) {
        if (error instanceof AppError && error.code === 'SLOT_TAKEN') {
          throw new AppError(
            'SLOT_TAKEN',
            'That time was taken after the cancellation. Reschedule instead.',
            {
              cause: error,
            },
          );
        }
        throw error;
      }
      await auditLogRepo.appendAuditEntry(
        {
          actor,
          action: 'booking.restore',
          entityType: 'booking',
          entityId: restored._id,
          before: { status: 'cancelled' },
          after: { status: 'confirmed' },
          meta: { notifyCustomer: input.notify },
          requestId: meta.requestId,
        },
        meta.now,
        { session },
      );
      const outboxIds = await enqueueBookingNotifications(
        {
          event: 'confirmed',
          view: toBookingView(restored, staff),
          settings,
          managePath: manageLinkFor(restored),
          previousStartAt: null,
          cancelReason: null,
          audience: { customer: input.notify, owner: false },
        },
        meta.now,
        session,
      );
      return { restored, outboxIds };
    });
    return {
      body: { booking: toAdminBookingView(done.restored, staff) },
      outboxIds: done.outboxIds,
    };
  }

  const updated = await withTransaction(async (session) => {
    const next = await bookingsRepo.transitionBookingStatus(
      booking._id,
      booking.status,
      to,
      meta.now,
      { session },
    );
    if (!next)
      throw new AppError(
        'INVALID_TRANSITION',
        'The booking changed in the meantime. Reload and try again.',
      );
    await auditLogRepo.appendAuditEntry(
      {
        actor,
        action: 'booking.status',
        entityType: 'booking',
        entityId: booking._id,
        before: { status: booking.status },
        after: { status: to },
        meta: reason ? { reason } : null,
        requestId: meta.requestId,
      },
      meta.now,
      { session },
    );
    return next;
  });
  return { body: { booking: toAdminBookingView(updated, staff) }, outboxIds: [] };
}

/** Owner reschedule through the shared core, optionally overriding lead time and the window. */
export async function ownerReschedule(
  principal: Principal,
  scope: Scope,
  id: string,
  input: { startAt: string; staff?: string | undefined; notify: boolean; override: boolean },
  meta: ServiceMeta,
): Promise<Changed<{ booking: AdminBookingView; managePath: string }>> {
  const booking = await loadBookingInScope(scope, id);
  if (booking.status !== 'confirmed') {
    throw new AppError('BOOKING_NOT_RESCHEDULABLE', 'Only confirmed bookings can be moved');
  }
  const settings = await shopSettingsRepo.requireShopSettings();
  const startAt = rescheduleStart(booking, input.startAt, input.staff, settings.booking);
  const done = await rescheduleBookingAs(
    booking,
    settings,
    { startAt, selector: input.staff ?? booking.staffId },
    {
      actor: actorOf(principal),
      override: input.override,
      audience: { customer: input.notify, owner: false },
      requestId: meta.requestId,
    },
    meta.now,
  );
  return {
    body: {
      booking: toAdminBookingView(done.moved, done.staff),
      managePath: manageLinkFor(done.moved),
    },
    outboxIds: done.outboxIds,
  };
}

export async function updateBookingNotes(
  principal: Principal,
  scope: Scope,
  id: string,
  notes: string | null,
  meta: ServiceMeta,
): Promise<{ booking: AdminBookingView }> {
  const booking = await loadBookingInScope(scope, id);
  const updated = await withTransaction(async (session) => {
    const next = await bookingsRepo.updateBookingNotes(
      booking._id,
      notes?.trim() ? notes.trim() : null,
      meta.now,
      {
        session,
      },
    );
    await auditLogRepo.appendAuditEntry(
      {
        actor: actorOf(principal),
        action: 'booking.notes',
        entityType: 'booking',
        entityId: booking._id,
        before: { notes: booking.notes },
        after: { notes: next.notes },
        meta: null,
        requestId: meta.requestId,
      },
      meta.now,
      { session },
    );
    return next;
  });
  return { booking: await viewOf(updated) };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function customerByPhone(rawPhone: string, now: Date): Promise<CustomerResponse> {
  const phone = normalizeUsPhone(rawPhone);
  if (!phone) {
    throw new AppError('VALIDATION_ERROR', 'Enter a valid US phone number', {
      details: [{ path: 'phone', message: 'Enter a valid US phone number' }],
    });
  }
  const bookings = await bookingsRepo.listBookingsForPhone(phone, 200);
  const staffById = new Map(
    (await staffRepo.listStaff({ includeDeleted: true })).map((s) => [s._id, s]),
  );
  const by = (status: BookingStatus) => bookings.filter((b) => b.status === status);
  return {
    phone: formatUsPhone(phone),
    names: [...new Set(bookings.map((b) => b.customer.name))],
    emails: [...new Set(bookings.flatMap((b) => (b.customer.email ? [b.customer.email] : [])))],
    counts: {
      total: bookings.length,
      upcoming: by('confirmed').filter((b) => b.endAt > now).length,
      completed: by('completed').length,
      noShow: by('noShow').length,
      cancelled: by('cancelled').length,
    },
    completedSpendCents: by('completed').reduce((sum, b) => sum + b.totalPriceCents, 0),
    bookings: bookings.map((b) => toAdminBookingView(b, staffName(staffById, b.staffId))),
  };
}
