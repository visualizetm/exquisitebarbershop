import type { ConflictResolution } from '../../shared/api/admin';
import { manualBookingRequestSchema } from '../../shared/api/admin';
import type {
  TeamBookingView,
  TeamDayResponse,
  TeamMeResponse,
  TeamTimeOffResponse,
  TeamWeekResponse,
} from '../../shared/api/team';
import { shopDateOf, shopDayBounds, shopDayStart, shopLocalToUtc } from '../../shared/lib/time';
import type { BookingDocument } from '../../shared/schemas/booking';
import type { Principal } from '../http/types';
import { AppError, isAppError } from '../lib/errors';
import { alertsRepo, bookingsRepo, staffRepo, timeBlocksRepo } from '../repos';
import { teamSessionsRepo } from '../repos';
import { actorOf, chairScope } from './access';
import {
  changeBookingStatus,
  updateBookingNotes,
  workingView,
  type ServiceMeta,
} from './adminBookings';
import { createTimeBlock, deleteTimeBlock, setDayStatus } from './adminSchedule';
import { createManualBooking } from './bookingService';
import { toTimeBlockView } from './bookingView';
import { staffPhotoMap } from './photosService';
import { loadScheduleData } from './scheduleData';

/**
 * Everything the barber portal does, on the caller's own chair. Every function takes the
 * principal and works in its chair scope, so another barber's bookings read as not found.
 * A client's phone number and email never leave this file: the view carries the name and the work.
 */
export function toTeamBookingView(b: BookingDocument): TeamBookingView {
  return {
    id: b._id,
    referenceCode: b.referenceCode,
    status: b.status,
    source: b.source,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    customerName: b.customer.name,
    services: b.services.map((s) => s.name),
    notes: b.notes,
    priceCents: b.totalPriceCents,
    discounts: b.discounts,
    arrivedAt: b.arrivedAt?.toISOString() ?? null,
    startedAt: b.startedAt?.toISOString() ?? null,
  };
}

/** The stored booking, for a view after an audited stamp. */
export async function bookingDocById(id: string): Promise<BookingDocument> {
  const b = await bookingsRepo.findBookingById(id);
  if (!b) throw new AppError('NOT_FOUND', 'Booking was not found');
  return b;
}

async function ownStaff(principal: Principal) {
  const { staffId } = chairScope(principal);
  const staff = await staffRepo.findStaffById(staffId);
  if (!staff || staff.deletedAt)
    throw new AppError('FORBIDDEN', 'This sign-in is no longer active');
  return staff;
}

export async function teamMe(principal: Principal): Promise<TeamMeResponse> {
  const staff = await ownStaff(principal);
  const [session, photos] = await Promise.all([
    teamSessionsRepo.findTeamSessionById(principal.sessionId),
    staffPhotoMap(),
  ]);
  return {
    staff: {
      id: staff._id,
      name: staff.name,
      title: staff.title,
      photo: photos.get(staff._id) ?? null,
      chairNumber: staff.chairNumber,
      bio: staff.bio,
      instagramHandle: staff.instagramHandle,
    },
    expiresAt: (session?.expiresAt ?? new Date()).toISOString(),
  };
}

const LIVE = ['confirmed', 'completed', 'noShow'] as const;

export async function teamDay(principal: Principal, now: Date): Promise<TeamDayResponse> {
  const staff = await ownStaff(principal);
  const date = shopDateOf(now);
  const bounds = shopDayBounds(date);
  const [data, bookings] = await Promise.all([
    loadScheduleData(date, date),
    bookingsRepo.listBookingsBetween(bounds, { staffId: staff._id, statuses: LIVE }),
  ]);
  const blocks = data.source.timeBlocks.filter(
    (b) => b.staffId === staff._id && b.startAt < bounds.end && b.endAt > bounds.start,
  );
  const confirmed = bookings.filter((b) => b.status === 'confirmed');
  return {
    date,
    now: now.toISOString(),
    working: workingView(staff._id, date, data.source),
    nextUp: toNext(confirmed, now),
    bookings: bookings.map(toTeamBookingView),
    blocks: blocks.map(toTimeBlockView),
    isOut: blocks.some(
      (b) => b.kind === 'dayOff' && b.startAt <= bounds.start && b.endAt >= bounds.end,
    ),
    counts: {
      total: bookings.length,
      done: bookings.filter((b) => b.status === 'completed').length,
      noShow: bookings.filter((b) => b.status === 'noShow').length,
      left: confirmed.length,
    },
  };
}

function toNext(confirmed: BookingDocument[], now: Date): TeamBookingView | null {
  const next = confirmed.find((b) => b.endAt > now);
  return next ? toTeamBookingView(next) : null;
}

export async function teamWeek(principal: Principal, now: Date): Promise<TeamWeekResponse> {
  const staff = await ownStaff(principal);
  const from = shopDateOf(now);
  const to = shopDayStart(from).plus({ days: 6 }).toISODate() ?? from;
  const [data, bookings] = await Promise.all([
    loadScheduleData(from, to),
    bookingsRepo.listBookingsBetween(
      { start: shopDayBounds(from).start, end: shopDayBounds(to).end },
      { staffId: staff._id, statuses: LIVE },
    ),
  ]);
  const days: TeamWeekResponse['days'] = [];
  for (let d = shopDayStart(from); (d.toISODate() ?? '') <= to; d = d.plus({ days: 1 })) {
    const date = d.toISODate() ?? from;
    const bounds = shopDayBounds(date);
    const mine = bookings.filter((b) => b.startAt >= bounds.start && b.startAt < bounds.end);
    days.push({
      date,
      working: workingView(staff._id, date, data.source),
      count: mine.filter((b) => b.status !== 'noShow').length,
      bookings: mine.map(toTeamBookingView),
      blocks: data.source.timeBlocks
        .filter((b) => b.staffId === staff._id && b.startAt < bounds.end && b.endAt > bounds.start)
        .map(toTimeBlockView),
    });
  }
  return { days };
}

/** Done, No show and Undo on the barber's own client. Cancelling is the owner's. */
export async function setBookingStatus(
  principal: Principal,
  id: string,
  status: 'completed' | 'noShow' | 'confirmed',
  meta: ServiceMeta,
): Promise<TeamBookingView> {
  const done = await changeBookingStatus(
    principal,
    chairScope(principal),
    id,
    { status, notify: false },
    meta,
  );
  return viewById(done.body.booking.id);
}

export async function setBookingNote(
  principal: Principal,
  id: string,
  notes: string | null,
  meta: ServiceMeta,
): Promise<TeamBookingView> {
  const done = await updateBookingNotes(principal, chairScope(principal), id, notes, meta);
  return viewById(done.booking.id);
}

async function viewById(id: string): Promise<TeamBookingView> {
  const booking = await bookingsRepo.findBookingById(id);
  if (!booking) throw new AppError('NOT_FOUND', 'Booking was not found');
  return toTeamBookingView(booking);
}

export async function addWalkIn(
  principal: Principal,
  input: { name: string; phone: string; serviceIds: string[] },
  meta: ServiceMeta & { ip: string; userAgent: string | null; idempotencyKey: string },
): Promise<{ booking: TeamBookingView; outsideWorkingTime: boolean }> {
  const staff = await ownStaff(principal);
  const request = manualBookingRequestSchema.parse({
    source: 'walkIn',
    serviceIds: input.serviceIds,
    staff: staff._id,
    customer: { name: input.name, phone: input.phone, email: null },
    notifyCustomer: false,
  });
  const outcome = await createManualBooking(request, actorOf(principal), meta);
  const body = outcome.body;
  return {
    booking: await viewById(body.booking.id),
    outsideWorkingTime: body.outsideWorkingTime,
  };
}

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

const AHEAD_DAYS = 90;

export async function teamTimeOff(principal: Principal, now: Date): Promise<TeamTimeOffResponse> {
  const staff = await ownStaff(principal);
  const today = shopDateOf(now);
  const range = {
    start: shopDayBounds(today).start,
    end: shopDayBounds(shopDayStart(today).plus({ days: AHEAD_DAYS }).toISODate() ?? today).end,
  };
  const [blocks, alerts] = await Promise.all([
    timeBlocksRepo.listTimeBlocksForStaff(staff._id, range),
    alertsRepo.listOpenAlerts(),
  ]);
  const todayBounds = shopDayBounds(today);
  return {
    isOutToday: blocks.some(
      (b) => b.kind === 'dayOff' && b.startAt <= todayBounds.start && b.endAt >= todayBounds.end,
    ),
    blocks: blocks.filter((b) => b.kind !== 'extraHours').map(toTimeBlockView),
    requests: alerts
      .filter((a) => a.staffId === staff._id && a.kind === 'timeOffRequest')
      .map((a) => ({ id: a._id, fromDate: a.fromDate, toDate: a.toDate, reason: a.reason })),
  };
}

export async function blockTime(
  principal: Principal,
  input: { date: string; start: string; end: string; reason?: string | undefined },
  meta: ServiceMeta,
) {
  const staff = await ownStaff(principal);
  return createTimeBlock(
    principal,
    chairScope(principal),
    {
      staffId: staff._id,
      kind: 'block',
      startAt: shopLocalToUtc(input.date, input.start).toISOString(),
      endAt: shopLocalToUtc(input.date, input.end).toISOString(),
      reason: input.reason,
    },
    meta,
  );
}

export async function removeBlock(principal: Principal, id: string, meta: ServiceMeta) {
  return deleteTimeBlock(principal, chairScope(principal), id, undefined, meta);
}

/** The ids a conflict answer lists, so a barber's "keep" can be sent for each. */
function affectedIds(error: unknown): string[] {
  if (!isAppError(error) || error.code !== 'SCHEDULE_CONFLICT') return [];
  const list = error.extra?.affected;
  if (!Array.isArray(list)) return [];
  return list.flatMap((a: unknown) =>
    typeof a === 'object' && a !== null && 'bookingId' in a && typeof a.bookingId === 'string'
      ? [a.bookingId]
      : [],
  );
}

const keepAll = (ids: string[]): ConflictResolution[] =>
  ids.map((bookingId) => ({ bookingId, action: 'keep' }));

/**
 * "I'm out today". A barber never cancels or moves anything: the day off is set, every booked
 * client stays where they are, and an alert tells the owner to decide about each one.
 */
export async function outToday(
  principal: Principal,
  meta: ServiceMeta,
): Promise<{ clients: number }> {
  const staff = await ownStaff(principal);
  const date = shopDateOf(meta.now);
  const input = { date, status: 'out' as const };
  let clients = 0;
  try {
    await setDayStatus(principal, staff._id, input, meta);
  } catch (error) {
    const ids = affectedIds(error);
    if (ids.length === 0) throw error;
    clients = ids.length;
    await setDayStatus(principal, staff._id, { ...input, resolutions: keepAll(ids) }, meta);
  }
  if (clients > 0) await raiseAlert('barberOut', staff._id, date, date, null, meta.now);
  return { clients };
}

/**
 * Days off ahead. When nothing is booked on those days they apply at once; otherwise the owner
 * gets a request and decides about each booked client before anything changes.
 */
export async function requestDaysOff(
  principal: Principal,
  input: { fromDate: string; toDate: string; reason?: string | undefined },
  meta: ServiceMeta,
): Promise<{ applied: boolean; clients: number }> {
  const staff = await ownStaff(principal);
  const range = {
    start: shopDayBounds(input.fromDate).start,
    end: shopDayBounds(input.toDate).end,
  };
  const booked = await bookingsRepo.listBookingsBetween(range, {
    staffId: staff._id,
    statuses: ['confirmed'],
  });
  if (booked.length === 0) {
    await createTimeBlock(
      principal,
      chairScope(principal),
      {
        staffId: staff._id,
        kind: 'timeOff',
        startAt: range.start.toISOString(),
        endAt: range.end.toISOString(),
        reason: input.reason,
      },
      meta,
    );
    return { applied: true, clients: 0 };
  }
  await raiseAlert(
    'timeOffRequest',
    staff._id,
    input.fromDate,
    input.toDate,
    input.reason ?? null,
    meta.now,
  );
  return { applied: false, clients: booked.length };
}

async function raiseAlert(
  kind: 'barberOut' | 'timeOffRequest',
  staffId: string,
  fromDate: string,
  toDate: string,
  reason: string | null,
  now: Date,
): Promise<void> {
  await alertsRepo.insertAlert(
    {
      kind,
      staffId,
      fromDate,
      toDate,
      startAt: shopDayBounds(fromDate).start,
      endAt: shopDayBounds(toDate).end,
      reason,
    },
    now,
  );
}
