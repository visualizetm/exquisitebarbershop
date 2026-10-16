import type { NoAvailabilityReason } from '../../shared/api/availability';
import { LOCK_GRANULARITY_MINUTES } from '../../shared/lib/constants';
import {
  addMinutes,
  ceilToStep,
  dayKeyOfIsoDate,
  isoDateOf,
  shopDateOf,
  shopDayBounds,
  shopDayStart,
  shopLocalToUtc,
  type DayKey,
} from '../../shared/lib/time';
import type { BookingDocument } from '../../shared/schemas/booking';
import type { ClosureDocument } from '../../shared/schemas/closure';
import type { TimeInterval, WeekHours } from '../../shared/schemas/common';
import type { ServiceDocument } from '../../shared/schemas/service';
import type { BookingSettings } from '../../shared/schemas/shopSettings';
import type { StaffDocument } from '../../shared/schemas/staff';
import type { TimeBlockDocument } from '../../shared/schemas/timeBlock';

/**
 * The availability engine. Pure: every input is passed in, nothing is loaded.
 * All instants are UTC Dates; calendar days are shop-local ISO dates.
 */

export interface Range {
  start: Date;
  end: Date;
}

export interface AvailabilityContext {
  settings: BookingSettings;
  /** The chosen services, in the order they will be performed. */
  services: ServiceDocument[];
  /** Every staff record that might qualify. The engine applies the qualification rules. */
  staff: StaffDocument[];
  shopHours: WeekHours | null;
  /** staffId to weekly hours. Staff without an entry are treated as not working. */
  staffHours: ReadonlyMap<string, WeekHours>;
  closures: ClosureDocument[];
  timeBlocks: TimeBlockDocument[];
  /** Confirmed bookings overlapping the requested range, for every chair. */
  bookings: BookingDocument[];
  now: Date;
}

export interface AvailabilityRequest {
  /** Inclusive shop-local ISO dates. */
  fromDate: string;
  toDate: string;
  /** "any" or a staff slug, alias or id. */
  staff: string;
  /** A booking being rescheduled: its own time does not count as busy. */
  excludeBookingId?: string;
}

export interface OpenSlot {
  startAt: Date;
  /** End of the appointment itself (services only). */
  endAt: Date;
  /** Chair chosen for this slot (the fairness pick when "any"). */
  staffId: string;
  /** Every free chair for this start, best pick first. Used for fallback on conflict. */
  candidates: string[];
}

export interface StaffDay {
  staffId: string;
  starts: Date[];
  /** Why this chair has nothing on this day, when it has nothing. */
  reason: 'dayOff' | 'fullyBooked' | 'outsideWindow' | null;
}

export interface DayAvailability {
  date: string;
  reason: NoAvailabilityReason | null;
  byStaff: StaffDay[];
  slots: OpenSlot[];
}

export interface AvailabilityResult {
  serviceMinutes: number;
  bufferMinutes: number;
  /** serviceMinutes + bufferMinutes: what a booking locks. */
  totalMinutes: number;
  /** Qualified chairs after applying the selector. */
  staff: StaffDocument[];
  days: DayAvailability[];
}

export const REASON_TEXT: Record<NoAvailabilityReason, string> = {
  closed: 'The shop is closed that day',
  dayOff: 'Not working that day',
  fullyBooked: 'Fully booked',
  outsideWindow: 'Outside the online booking window',
  noQualifiedStaff: 'No one offers those services online',
};

/** Finds a staff member by current slug, former slug or id. */
export function resolveStaffSelector(
  staff: readonly StaffDocument[],
  selector: string,
): StaffDocument | null {
  if (selector === 'any') return null;
  return staff.find((s) => s._id === selector || s.slugKeys.includes(selector)) ?? null;
}

/** A chair qualifies when it is live on the site, bookable online and does every chosen service. */
export function staffQualifies(
  staff: StaffDocument,
  services: readonly ServiceDocument[],
): boolean {
  return (
    staff.deletedAt === null &&
    staff.showOnWebsite &&
    staff.acceptsOnlineBooking &&
    services.every((s) => staff.serviceIds.includes(s._id))
  );
}

export function serviceMinutesOf(services: readonly ServiceDocument[]): number {
  return services.reduce((sum, s) => sum + s.durationMinutes, 0);
}

/** The shop default unless a chosen service asks for more; the longest wins. */
export function effectiveBufferMinutes(
  services: readonly ServiceDocument[],
  settings: BookingSettings,
): number {
  return services.reduce(
    (max, s) => Math.max(max, s.bufferMinutes ?? settings.bufferMinutes),
    services.length === 0 ? settings.bufferMinutes : 0,
  );
}

/** Last bookable shop-local date, inclusive. */
export function bookingWindowEnd(now: Date, settings: BookingSettings): string {
  return isoDateOf(shopDayStart(shopDateOf(now)).plus({ days: settings.bookingWindowDays }));
}

export function isDateInWindow(date: string, now: Date, settings: BookingSettings): boolean {
  const today = shopDateOf(now);
  return date >= today && date <= bookingWindowEnd(now, settings);
}

function intervalsToRanges(date: string, intervals: readonly TimeInterval[]): Range[] {
  return intervals.map((i) => ({
    start: shopLocalToUtc(date, i.start),
    end: shopLocalToUtc(date, i.end),
  }));
}

function clip(range: Range, bounds: Range): Range | null {
  const start = new Date(Math.max(range.start.getTime(), bounds.start.getTime()));
  const end = new Date(Math.min(range.end.getTime(), bounds.end.getTime()));
  return end.getTime() > start.getTime() ? { start, end } : null;
}

function overlaps(a: Range, b: Range): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Sorted, merged union of ranges. */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start.getTime() <= last.end.getTime()) {
      if (r.end.getTime() > last.end.getTime()) last.end = r.end;
    } else {
      out.push({ start: r.start, end: r.end });
    }
  }
  return out;
}

export function intersectRanges(a: readonly Range[], b: readonly Range[]): Range[] {
  const out: Range[] = [];
  for (const x of a)
    for (const y of b) {
      const c = clip(x, y);
      if (c) out.push(c);
    }
  return mergeRanges(out);
}

export function subtractRanges(base: readonly Range[], holes: readonly Range[]): Range[] {
  let current = mergeRanges(base);
  for (const hole of mergeRanges(holes)) {
    const next: Range[] = [];
    for (const r of current) {
      if (!overlaps(r, hole)) {
        next.push(r);
        continue;
      }
      if (r.start.getTime() < hole.start.getTime()) next.push({ start: r.start, end: hole.start });
      if (hole.end.getTime() < r.end.getTime()) next.push({ start: hole.end, end: r.end });
    }
    current = next;
  }
  return current;
}

/** Shop open ranges for a date: closure first, then weekly hours. Null means closed. */
export function shopRangesFor(
  date: string,
  dayKey: DayKey,
  shopHours: WeekHours | null,
  closures: readonly ClosureDocument[],
): Range[] | null {
  const closure = closures.find((c) => c.date === date);
  if (closure) {
    if (closure.kind === 'closed') return null;
    return intervalsToRanges(date, closure.intervals);
  }
  const intervals = shopHours?.[dayKey] ?? [];
  return intervals.length === 0 ? null : intervalsToRanges(date, intervals);
}

interface StaffDayInput {
  staff: StaffDocument;
  date: string;
  dayKey: DayKey;
  dayBounds: Range;
  shopRanges: Range[];
  ctx: AvailabilityContext;
  totalMinutes: number;
  serviceMinutes: number;
  excludeBookingId: string | undefined;
}

function computeStaffDay(input: StaffDayInput): StaffDay {
  const { staff, date, dayKey, dayBounds, shopRanges, ctx, totalMinutes } = input;
  const blocks = ctx.timeBlocks.filter(
    (b) => b.staffId === staff._id && overlaps({ start: b.startAt, end: b.endAt }, dayBounds),
  );

  const base = intervalsToRanges(date, ctx.staffHours.get(staff._id)?.[dayKey] ?? []);
  const extra = blocks
    .filter((b) => b.kind === 'extraHours')
    .map((b) => clip({ start: b.startAt, end: b.endAt }, dayBounds))
    .filter((r): r is Range => r !== null);
  const scheduled = intersectRanges(mergeRanges([...base, ...extra]), shopRanges);
  if (scheduled.length === 0) return { staffId: staff._id, starts: [], reason: 'dayOff' };

  const off = blocks
    .filter((b) => b.kind === 'timeOff' || b.kind === 'dayOff')
    .map((b) => ({ start: b.startAt, end: b.endAt }));
  const working = subtractRanges(scheduled, off);
  if (working.length === 0) return { staffId: staff._id, starts: [], reason: 'dayOff' };

  const busy: Range[] = [
    ...ctx.bookings
      .filter(
        (b) =>
          b.staffId === staff._id &&
          b.status === 'confirmed' &&
          b._id !== input.excludeBookingId &&
          overlaps({ start: b.startAt, end: addMinutes(b.endAt, b.bufferMinutes) }, dayBounds),
      )
      .map((b) => ({ start: b.startAt, end: addMinutes(b.endAt, b.bufferMinutes) })),
    ...blocks.filter((b) => b.kind === 'block').map((b) => ({ start: b.startAt, end: b.endAt })),
  ];

  const step = ctx.settings.slotStepMinutes;
  const earliest = addMinutes(ctx.now, ctx.settings.leadTimeMinutes);
  const starts: Date[] = [];
  let freeBeforeLead = 0;
  for (const range of working) {
    for (let t = ceilToStep(range.start, step); ; t = addMinutes(t, step)) {
      const candidate: Range = { start: t, end: addMinutes(t, totalMinutes) };
      if (candidate.end.getTime() > range.end.getTime()) break;
      if (busy.some((b) => overlaps(b, candidate))) continue;
      if (t.getTime() < earliest.getTime()) {
        freeBeforeLead += 1;
        continue;
      }
      starts.push(t);
    }
  }
  if (starts.length === 0) {
    return {
      staffId: staff._id,
      starts,
      reason: freeBeforeLead > 0 ? 'outsideWindow' : 'fullyBooked',
    };
  }
  return { staffId: staff._id, starts, reason: null };
}

/** Minutes of confirmed work each chair already has on a day, for the fairness pick. */
function bookedMinutesByStaff(
  ctx: AvailabilityContext,
  dayBounds: Range,
  exclude: string | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of ctx.bookings) {
    if (b.status !== 'confirmed' || b._id === exclude) continue;
    if (!overlaps({ start: b.startAt, end: b.endAt }, dayBounds)) continue;
    out.set(b.staffId, (out.get(b.staffId) ?? 0) + b.durationMinutes);
  }
  return out;
}

export type RankedStaff = [StaffDocument, ...StaffDocument[]];

/**
 * Orders free chairs for one start: fewest booked minutes first, then display
 * order. Callers pass at least one candidate, so the result is never empty.
 */
export function rankCandidates(
  candidates: readonly StaffDocument[],
  booked: ReadonlyMap<string, number>,
  strategy: BookingSettings['firstAvailableStrategy'],
  slotIndex: number,
): RankedStaff {
  const byOrder = [...candidates].sort(
    (a, b) => a.sortOrder - b.sortOrder || a._id.localeCompare(b._id),
  );
  if (strategy === 'roundRobin') {
    const offset = slotIndex % byOrder.length;
    return [...byOrder.slice(offset), ...byOrder.slice(0, offset)] as RankedStaff;
  }
  return byOrder.sort((a, b) => (booked.get(a._id) ?? 0) - (booked.get(b._id) ?? 0)) as RankedStaff;
}

function summarizeReason(
  byStaff: readonly StaffDay[],
): Exclude<NoAvailabilityReason, 'closed' | 'noQualifiedStaff'> {
  if (byStaff.every((s) => s.reason === 'dayOff')) return 'dayOff';
  const working = byStaff.filter((s) => s.reason !== 'dayOff');
  if (working.some((s) => s.reason === 'fullyBooked')) return 'fullyBooked';
  return 'outsideWindow';
}

export function computeAvailability(
  request: AvailabilityRequest,
  ctx: AvailabilityContext,
): AvailabilityResult {
  const serviceMinutes = serviceMinutesOf(ctx.services);
  const bufferMinutes = effectiveBufferMinutes(ctx.services, ctx.settings);
  const totalMinutes = serviceMinutes + bufferMinutes;

  const selected = request.staff === 'any' ? null : resolveStaffSelector(ctx.staff, request.staff);
  const pool = request.staff === 'any' ? ctx.staff : selected ? [selected] : [];
  const qualified = pool.filter((s) => staffQualifies(s, ctx.services));

  const days: DayAvailability[] = [];
  let cursor = shopDayStart(request.fromDate);
  const endDate = request.toDate;
  let slotIndex = 0;
  for (; isoDateOf(cursor) <= endDate; cursor = cursor.plus({ days: 1 })) {
    const date = isoDateOf(cursor);
    const empty = (reason: NoAvailabilityReason): DayAvailability => ({
      date,
      reason,
      byStaff: [],
      slots: [],
    });
    if (!isDateInWindow(date, ctx.now, ctx.settings)) {
      days.push(empty('outsideWindow'));
      continue;
    }
    if (qualified.length === 0) {
      days.push(empty('noQualifiedStaff'));
      continue;
    }
    const dayKey = dayKeyOfIsoDate(date);
    const shopRanges = shopRangesFor(date, dayKey, ctx.shopHours, ctx.closures);
    if (!shopRanges) {
      days.push(empty('closed'));
      continue;
    }
    const dayBounds = shopDayBounds(date);
    const staffDays = qualified.map((staff) => ({
      staff,
      day: computeStaffDay({
        staff,
        date,
        dayKey,
        dayBounds,
        shopRanges,
        ctx,
        totalMinutes,
        serviceMinutes,
        excludeBookingId: request.excludeBookingId,
      }),
    }));
    const byStaff = staffDays.map((sd) => sd.day);

    const byStart = new Map<number, StaffDocument[]>();
    for (const { staff, day } of staffDays) {
      for (const start of day.starts) {
        const key = start.getTime();
        const list = byStart.get(key) ?? [];
        list.push(staff);
        byStart.set(key, list);
      }
    }
    const booked = bookedMinutesByStaff(ctx, dayBounds, request.excludeBookingId);
    const slots: OpenSlot[] = [...byStart.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, candidates]) => {
        const ranked = rankCandidates(
          candidates,
          booked,
          ctx.settings.firstAvailableStrategy,
          slotIndex,
        );
        slotIndex += 1;
        const startAt = new Date(time);
        return {
          startAt,
          endAt: addMinutes(startAt, serviceMinutes),
          staffId: ranked[0]._id,
          candidates: ranked.map((s) => s._id),
        };
      });

    days.push({
      date,
      reason: slots.length === 0 ? summarizeReason(byStaff) : null,
      byStaff,
      slots,
    });
  }

  return { serviceMinutes, bufferMinutes, totalMinutes, staff: qualified, days };
}

/** The slot for an exact start on a day, or null. */
export function findSlot(result: AvailabilityResult, startAt: Date): OpenSlot | null {
  const date = shopDateOf(startAt);
  const day = result.days.find((d) => d.date === date);
  return day?.slots.find((s) => s.startAt.getTime() === startAt.getTime()) ?? null;
}

/** The next open times at or after an instant, for SLOT_TAKEN responses. */
export function nextOpenSlots(result: AvailabilityResult, after: Date, limit: number): OpenSlot[] {
  const out: OpenSlot[] = [];
  for (const day of result.days) {
    for (const slot of day.slots) {
      if (slot.startAt.getTime() >= after.getTime()) out.push(slot);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** True when an instant sits on the lock grid and the customer-facing step. */
export function isOnSlotGrid(instant: Date, settings: BookingSettings): boolean {
  const ms = settings.slotStepMinutes * 60_000;
  return (
    instant.getTime() % ms === 0 && instant.getTime() % (LOCK_GRANULARITY_MINUTES * 60_000) === 0
  );
}
