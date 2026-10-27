import type { AdminBookingView, NowResponse } from '../../shared/api/admin';
import type {
  ChairEstimate,
  LineResponse,
  WaitEstimateView,
  WalkInView,
} from '../../shared/api/line';
import { chairState } from '../../shared/lib/floor';
import {
  chairGate,
  firstAvailableGate,
  gateText,
  gateView,
  type NowGate,
  type OpenSpan,
} from '../../shared/lib/openNow';
import { formatUsPhone } from '../../shared/lib/phone';
import {
  addDaysToIsoDate,
  dayKeyOfIsoDate,
  shopDateOf,
  shopDayBounds,
} from '../../shared/lib/time';
import {
  estimateForChair,
  estimateInLine,
  type ChairLoad,
  type PoolPerson,
  type WaitEstimate,
} from '../../shared/lib/waitEstimate';
import type { BookingCustomer, BookingDocument } from '../../shared/schemas/booking';
import type { ServiceDocument } from '../../shared/schemas/service';
import type { ShopSettingsDocument } from '../../shared/schemas/shopSettings';
import type { StaffDocument } from '../../shared/schemas/staff';
import type { WalkInDocument } from '../../shared/schemas/walkIn';
import { withTransaction } from '../db/transaction';
import type { Principal } from '../http/types';
import { AppError } from '../lib/errors';
import {
  auditLogRepo,
  bookingsRepo,
  servicesRepo,
  shopSettingsRepo,
  staffRepo,
  walkInsRepo,
} from '../repos';
import { actorOf, assertInScope, type Scope } from './access';
import { activeStaff, type ServiceMeta } from './adminBookings';
import { quoteStaff, shopRangesFor, workingRangesFor } from './availability';
import { createManualBooking, type RequestMeta } from './bookingService';
import { toAdminBookingView } from './bookingView';
import { loadScheduleData, type ScheduleData } from './scheduleData';

const FIRST_AVAILABLE = 'First available';

interface Snapshot {
  now: Date;
  data: ScheduleData;
  services: ServiceDocument[];
  settings: ShopSettingsDocument;
  waiting: WalkInDocument[];
  chairs: ChairLoad[];
  staffById: Map<string, StaffDocument>;
  /** Today's shop hours, the next time the shop opens, and each chair's hours today. */
  shopRanges: OpenSpan[];
  opensAt: Date | null;
  hours: Map<string, OpenSpan[]>;
}

/** How many days ahead the "Opens Tue 10 AM" line looks. */
const OPENING_LOOKAHEAD_DAYS = 8;

function nextOpening(data: ScheduleData, today: string, now: Date): Date | null {
  for (let i = 0; i < OPENING_LOOKAHEAD_DAYS; i += 1) {
    const date = addDaysToIsoDate(today, i);
    const ranges = shopRangesFor(
      date,
      dayKeyOfIsoDate(date),
      data.source.shopHours,
      data.source.closures,
    );
    const next = (ranges ?? []).find((r) => r.start.getTime() > now.getTime());
    if (next) return next.start;
  }
  return null;
}

/** Everything the estimates need, read once per request. */
async function snapshot(now: Date): Promise<Snapshot> {
  const today = shopDateOf(now);
  const [data, bookings, services, settings, waiting] = await Promise.all([
    loadScheduleData(today, addDaysToIsoDate(today, OPENING_LOOKAHEAD_DAYS)),
    bookingsRepo.listBookingsBetween(shopDayBounds(today)),
    servicesRepo.listServices(),
    shopSettingsRepo.requireShopSettings(),
    walkInsRepo.listWaiting(),
  ]);
  const staff = activeStaff(data.staff);
  const chairs = staff.map((s) => chairLoad(s, bookings, data, today, now));
  return {
    now,
    data,
    services,
    settings,
    waiting,
    chairs,
    staffById: new Map(data.staff.map((s) => [s._id, s])),
    shopRanges:
      shopRangesFor(today, dayKeyOfIsoDate(today), data.source.shopHours, data.source.closures) ??
      [],
    opensAt: nextOpening(data, today, now),
    hours: new Map(staff.map((s) => [s._id, workingRangesFor(s._id, today, data.source).ranges])),
  };
}

function chairLoad(
  staff: StaffDocument,
  bookings: BookingDocument[],
  data: ScheduleData,
  today: string,
  now: Date,
): ChairLoad {
  const mine = bookings
    .filter((b) => b.staffId === staff._id)
    .map((b) => ({ ...b, id: b._id, startedAt: b.startedAt ?? null }));
  const state = chairState({ bookings: mine, working: true, instagramOnly: false, now });
  return {
    staffId: staff._id,
    // Hours today, or a cut going on right now (a walk-in outside the hours still means the
    // barber is in).
    working:
      workingRangesFor(staff._id, today, data.source).ranges.length > 0 || state.window !== null,
    busyUntil: state.window?.endAt ?? null,
    bookings: mine
      .filter((b) => b.status === 'confirmed' && b !== state.current && b.endAt > now)
      .map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
  };
}

/** The minutes a walk-in's services take with a chair (its own times), or the shop's times. */
function minutesFor(snap: Snapshot, serviceIds: string[], staffId: string | null): number {
  const services = serviceIds
    .map((id) => snap.services.find((s) => s._id === id))
    .filter((s): s is ServiceDocument => s !== undefined);
  const staff = staffId ? snap.staffById.get(staffId) : undefined;
  if (staff) {
    const quote = quoteStaff(staff, services, snap.settings.booking);
    if (quote) return quote.serviceMinutes;
  }
  return services.reduce((sum, s) => sum + s.durationMinutes, 0);
}

function toView(e: WaitEstimate): WaitEstimateView {
  return e.kind === 'about' ? { kind: 'about', at: e.at.toISOString(), minutes: e.minutes } : e;
}

/** The hours rule for one chair, or for first available when `staffId` is null. */
function gateFor(snap: Snapshot, staffId: string | null): NowGate {
  const named = (id: string) => ({
    name: snap.staffById.get(id)?.name ?? 'Chair',
    ranges: snap.hours.get(id) ?? [],
  });
  if (staffId) return chairGate(named(staffId), snap.shopRanges, snap.now, snap.opensAt);
  return firstAvailableGate(
    snap.chairs.map((c) => named(c.staffId)),
    snap.shopRanges,
    snap.now,
    snap.opensAt,
  );
}

/** NOW and the line are only offered inside the hours; outside them the request is refused. */
function assertOpen(snap: Snapshot, staffId: string | null): void {
  const gate = gateFor(snap, staffId);
  if (gate.kind === 'open') return;
  const message = gateText(gate) ?? 'Not right now';
  throw new AppError(
    gate.kind === 'off' || gate.kind === 'done' ? 'BARBER_OFF' : 'SHOP_CLOSED',
    message,
  );
}

/** The Today flag on a waiting entry whose chair is no longer taking anyone. */
function flagFor(snap: Snapshot, w: WalkInDocument): string | null {
  const gate = gateFor(snap, w.staffId);
  switch (gate.kind) {
    case 'open':
      return null;
    case 'closed':
      return 'The shop is closed. Mark left';
    case 'off':
      return `${gate.name} is off. Move or mark left`;
    case 'done':
      return `${gate.name} is done for the day. Move or mark left`;
    case 'nobody':
      return 'Nobody is in. Mark left';
  }
}

function persons(snap: Snapshot): PoolPerson[] {
  return snap.waiting.map((w) => ({
    staffId: w.staffId,
    minutes: minutesFor(snap, w.serviceIds, w.staffId),
  }));
}

/** Each chair right now: free, free about a time (its own line counted), or unknown (off today). */
function chairEstimates(snap: Snapshot): ChairEstimate[] {
  return snap.chairs.map((chair) => {
    const staff = snap.staffById.get(chair.staffId);
    const ahead = snap.waiting
      .filter((w) => w.staffId === chair.staffId)
      .map((w) => minutesFor(snap, w.serviceIds, chair.staffId));
    return {
      staffId: chair.staffId,
      name: staff?.name ?? 'Chair',
      chairNumber: staff?.chairNumber ?? null,
      gate: gateView(gateFor(snap, chair.staffId)),
      estimate: toView(estimateForChair(chair, ahead, 1, snap.now)),
    };
  });
}

function walkInView(snap: Snapshot, w: WalkInDocument): WalkInView {
  const index = snap.waiting.findIndex((x) => x._id === w._id);
  const line = persons(snap);
  const inLine = index >= 0;
  const mine = inLine
    ? estimateInLine(snap.chairs, line, index, snap.now)
    : { estimate: { kind: 'unknown' as const }, staffId: null };
  const options: ChairEstimate[] = snap.chairs.map((chair) => {
    const staff = snap.staffById.get(chair.staffId);
    const minutes = minutesFor(snap, w.serviceIds, chair.staffId);
    const estimate = inLine
      ? estimateInLine(
          snap.chairs,
          line.map((p, i) => (i === index ? { staffId: chair.staffId, minutes } : p)),
          index,
          snap.now,
        ).estimate
      : estimateForChair(chair, [], minutes, snap.now);
    return {
      staffId: chair.staffId,
      name: staff?.name ?? 'Chair',
      chairNumber: staff?.chairNumber ?? null,
      gate: gateView(gateFor(snap, chair.staffId)),
      estimate: toView(estimate),
    };
  });
  return {
    id: w._id,
    name: w.name,
    phone: formatUsPhone(w.phone),
    services: w.serviceIds.map((id) => ({
      id,
      name: snap.services.find((s) => s._id === id)?.name ?? 'Service',
    })),
    serviceMinutes: minutesFor(snap, w.serviceIds, w.staffId),
    staffId: w.staffId,
    staffName: w.staffId ? (snap.staffById.get(w.staffId)?.name ?? 'Chair') : FIRST_AVAILABLE,
    status: w.status,
    position: w.position,
    note: w.note,
    createdAt: w.createdAt.toISOString(),
    seatedAt: w.seatedAt?.toISOString() ?? null,
    bookingId: w.bookingId,
    waitingMinutes: Math.max(
      0,
      Math.floor(((w.seatedAt ?? snap.now).getTime() - w.createdAt.getTime()) / 60_000),
    ),
    estimate: toView(mine.estimate),
    expectedStaffId: w.staffId ?? mine.staffId,
    flag: flagFor(snap, w),
    options,
  };
}

export async function lineView(now: Date): Promise<LineResponse> {
  const snap = await snapshot(now);
  return {
    now: now.toISOString(),
    line: snap.waiting.map((w) => walkInView(snap, w)),
    chairs: chairEstimates(snap),
    firstAvailable: gateView(gateFor(snap, null)),
  };
}

async function requireChair(staffId: string): Promise<StaffDocument> {
  const staff = await staffRepo.findStaffById(staffId);
  // A missing chair reads as undefined, which is not null, so it is refused too.
  if (staff?.deletedAt !== null) throw new AppError('NOT_FOUND', 'That chair was not found');
  return staff;
}

async function requireWaiting(id: string): Promise<WalkInDocument> {
  const w = await walkInsRepo.findWalkInById(id);
  if (!w) throw new AppError('NOT_FOUND', 'That walk-in was not found');
  if (w.status === 'seated') throw new AppError('ALREADY_SEATED', 'They are already in a chair');
  if (w.status === 'left') throw new AppError('INVALID_TRANSITION', 'They left the line');
  return w;
}

async function audit(
  principal: Principal,
  action: string,
  w: WalkInDocument,
  before: unknown,
  after: unknown,
  meta: ServiceMeta,
): Promise<void> {
  await auditLogRepo.appendAuditEntry(
    {
      actor: actorOf(principal),
      action,
      entityType: 'walkIn',
      entityId: w._id,
      before,
      after,
      meta: null,
      requestId: meta.requestId,
    },
    meta.now,
  );
}

export async function addToLine(
  principal: Principal,
  input: {
    name: string;
    phone: string;
    serviceIds: string[];
    staffId?: string | null | undefined;
    note?: string | undefined;
  },
  meta: ServiceMeta,
): Promise<WalkInView> {
  const staffId = input.staffId ?? null;
  if (staffId) await requireChair(staffId);
  const services = await servicesRepo.findServicesByIds(input.serviceIds);
  if (services.length !== new Set(input.serviceIds).size) {
    throw new AppError('SERVICE_UNAVAILABLE', 'A chosen service was not found');
  }
  assertOpen(await snapshot(meta.now), staffId);
  const w = await walkInsRepo.insertWalkIn(
    {
      name: input.name,
      phone: input.phone,
      serviceIds: input.serviceIds,
      staffId,
      status: 'waiting',
      note: input.note?.trim() ? input.note.trim() : null,
      seatedAt: null,
      leftAt: null,
      bookingId: null,
      createdBy: actorOf(principal),
    },
    meta.now,
  );
  await audit(principal, 'line.add', w, null, { staffId, serviceIds: input.serviceIds }, meta);
  return walkInView(await snapshot(meta.now), w);
}

export async function updateInLine(
  principal: Principal,
  id: string,
  patch: { staffId?: string | null | undefined; serviceIds?: string[] | undefined },
  meta: ServiceMeta,
): Promise<WalkInView> {
  const before = await requireWaiting(id);
  if (patch.staffId) await requireChair(patch.staffId);
  const set: { staffId?: string | null; serviceIds?: string[] } = {};
  if (patch.staffId !== undefined) set.staffId = patch.staffId;
  if (patch.serviceIds !== undefined) set.serviceIds = patch.serviceIds;
  const w = await walkInsRepo.updateWalkIn(id, set);
  if (!w) throw new AppError('ALREADY_SEATED', 'They are already in a chair');
  await audit(
    principal,
    'line.update',
    w,
    { staffId: before.staffId, serviceIds: before.serviceIds },
    { staffId: w.staffId, serviceIds: w.serviceIds },
    meta,
  );
  return walkInView(await snapshot(meta.now), w);
}

/** Swaps the entry with its neighbor; at the end of the line nothing changes. */
export async function moveInLine(
  principal: Principal,
  id: string,
  direction: 'up' | 'down',
  meta: ServiceMeta,
): Promise<LineResponse> {
  const me = await requireWaiting(id);
  const waiting = await walkInsRepo.listWaiting();
  const index = waiting.findIndex((w) => w._id === id);
  const other = waiting[direction === 'up' ? index - 1 : index + 1];
  if (other) {
    await withTransaction(async (session) => {
      await walkInsRepo.updateWalkIn(me._id, { position: other.position }, { session });
      await walkInsRepo.updateWalkIn(other._id, { position: me.position }, { session });
    });
    await audit(
      principal,
      'line.move',
      me,
      { position: me.position },
      { position: other.position, direction },
      meta,
    );
  }
  return lineView(meta.now);
}

export async function leaveLine(
  principal: Principal,
  id: string,
  meta: ServiceMeta,
): Promise<WalkInView> {
  await requireWaiting(id);
  const w = await walkInsRepo.markLeft(id, meta.now);
  if (!w) throw new AppError('ALREADY_SEATED', 'They are already in a chair');
  await audit(principal, 'line.left', w, { status: 'waiting' }, { status: 'left' }, meta);
  return walkInView(await snapshot(meta.now), w);
}

function busyError(estimate: WaitEstimateView, staffName: string): AppError {
  const when =
    estimate.kind === 'about'
      ? `${staffName} is busy for about ${String(estimate.minutes)} more minutes`
      : `${staffName} cannot take this now`;
  return new AppError('CHAIR_BUSY', when, { details: [], extra: { estimate } });
}

/**
 * Seats a walk-in: a real booking starting this minute, through the booking service and its slot
 * locks, with arrivedAt set and the walk-in source. The entry is claimed first so two taps can
 * only ever make one booking; a chair that cannot take the full service now is refused with the
 * estimate, and the slot locks are the last word under concurrency.
 */
export async function seatFromLine(
  principal: Principal,
  scope: Scope,
  id: string,
  requestedStaffId: string | undefined,
  meta: RequestMeta,
): Promise<{ walkIn: WalkInView; booking: AdminBookingView }> {
  const w = await requireWaiting(id);
  const snap = await snapshot(meta.now);
  const minutesOn = (staffId: string) => minutesFor(snap, w.serviceIds, staffId);
  // Seating ignores the hours, like any walk-in: the barber is standing there. The chair's cut
  // and its bookings still decide.
  const freeNow = (staffId: string) => {
    const chair = snap.chairs.find((c) => c.staffId === staffId);
    return chair
      ? estimateForChair({ ...chair, working: true }, [], minutesOn(staffId), meta.now)
      : null;
  };
  let staffId = requestedStaffId ?? w.staffId;
  if (!staffId) {
    const free = snap.chairs.find((c) => freeNow(c.staffId)?.kind === 'free');
    if (!free) {
      const view = walkInView(snap, w);
      throw busyError(view.estimate, 'Every chair');
    }
    staffId = free.staffId;
  }
  assertInScope(scope, staffId, 'Chair');
  const staff = await requireChair(staffId);
  const estimate = freeNow(staffId);
  if (estimate?.kind !== 'free') {
    throw busyError(toView(estimate ?? { kind: 'unknown' }), staff.name);
  }

  const claimed = await walkInsRepo.claimForSeating(id, meta.now);
  if (!claimed) throw new AppError('ALREADY_SEATED', 'They are already in a chair');
  let booking: AdminBookingView;
  try {
    const outcome = await createManualBooking(
      {
        source: 'walkIn',
        serviceIds: w.serviceIds,
        staff: staffId,
        customer: { name: w.name, phone: w.phone, email: null },
        ...(w.note ? { notes: w.note } : {}),
        override: false,
        notifyCustomer: false,
        arrived: true,
      },
      actorOf(principal),
      { ...meta, idempotencyKey: `line-seat-${id}-${meta.requestId}` },
    );
    booking = outcome.body.booking;
  } catch (error) {
    await walkInsRepo.releaseSeating(id);
    if (error instanceof AppError && error.code === 'SLOT_TAKEN') {
      throw busyError(toView(freeNow(staffId) ?? { kind: 'unknown' }), staff.name);
    }
    throw error;
  }
  await walkInsRepo.finishSeating(id, booking.id);
  const seated = (await walkInsRepo.findWalkInById(id)) ?? { ...claimed, bookingId: booking.id };
  await audit(
    principal,
    'line.seat',
    seated,
    { status: 'waiting' },
    { status: 'seated', staffId, bookingId: booking.id },
    meta,
  );
  const fresh = await bookingsRepo.findBookingById(booking.id);
  return {
    walkIn: walkInView(await snapshot(meta.now), seated),
    booking: fresh ? toAdminBookingView(fresh, staff) : booking,
  };
}

/**
 * NOW, for owner and barber sessions only: when a chair can take the full service this minute
 * the booking is made right away (walk-in source, arrivedAt set, off the 15 minute grid and
 * inside the lead time, through the booking service and its slot locks); otherwise the client
 * joins the line for that chair, or the shared line for first available. Two NOWs for one chair
 * at once: the slot locks let one through and the other joins the line.
 */
export async function bookNow(
  principal: Principal,
  scope: Scope,
  input: {
    serviceIds: string[];
    staffId?: string | null | undefined;
    customer: BookingCustomer;
    notes?: string | undefined;
  },
  meta: RequestMeta & { idempotencyKey: string },
): Promise<NowResponse> {
  const wanted = scope.kind === 'chair' ? scope.staffId : (input.staffId ?? null);
  if (wanted) await requireChair(wanted);
  const snap = await snapshot(meta.now);
  assertOpen(snap, wanted);
  const candidates = snap.chairs.filter((c) => (wanted ? c.staffId === wanted : c.working));
  const free = candidates.filter(
    (c) =>
      estimateForChair(
        { ...c, working: true },
        [],
        minutesFor(snap, input.serviceIds, c.staffId),
        meta.now,
      ).kind === 'free',
  );
  const joinLine = async (): Promise<NowResponse> => ({
    kind: 'line',
    walkIn: await addToLine(
      principal,
      {
        name: input.customer.name,
        phone: input.customer.phone,
        serviceIds: input.serviceIds,
        staffId: wanted,
        ...(input.notes ? { note: input.notes } : {}),
      },
      meta,
    ),
  });
  // With nobody ahead on that chair, book it; a person already waiting for it goes first.
  const nobodyAhead = (staffId: string) =>
    !snap.waiting.some((w) => w.staffId === staffId || (w.staffId === null && !wanted));
  const chair = free.find((c) => nobodyAhead(c.staffId));
  if (!chair) return joinLine();
  try {
    const outcome = await createManualBooking(
      {
        source: 'walkIn',
        serviceIds: input.serviceIds,
        staff: chair.staffId,
        customer: input.customer,
        ...(input.notes ? { notes: input.notes } : {}),
        override: false,
        notifyCustomer: input.customer.email !== null,
        arrived: true,
      },
      actorOf(principal),
      meta,
    );
    return { kind: 'booking', booking: outcome.body.booking };
  } catch (error) {
    if (error instanceof AppError && error.code === 'SLOT_TAKEN') return joinLine();
    throw error;
  }
}
