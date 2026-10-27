import { DateTime, Interval } from 'luxon';
import { LOCK_GRANULARITY_MINUTES, SHOP_TIMEZONE } from './constants';

/**
 * Time helpers. Storage and transport use UTC `Date` values. Shop-local values
 * (a calendar day, a wall-clock time) only exist at the edges and are always
 * resolved through these helpers so DST is handled in one place.
 */

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const DAY_KEYS: readonly DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value) && DateTime.fromISO(value, { zone: SHOP_TIMEZONE }).isValid;
}

/** ISO date (YYYY-MM-DD) of a DateTime. Throws instead of returning null for an invalid value. */
export function isoDateOf(dt: DateTime): string {
  const iso = dt.toISODate();
  if (iso === null) throw new RangeError('Invalid DateTime');
  return iso;
}

/** Start of the given shop-local calendar day as a Luxon DateTime in the shop zone. */
export function shopDayStart(isoDate: string): DateTime {
  const dt = DateTime.fromISO(isoDate, { zone: SHOP_TIMEZONE });
  if (!dt.isValid || !ISO_DATE_PATTERN.test(isoDate)) {
    throw new RangeError(`Invalid ISO date: ${isoDate}`);
  }
  return dt.startOf('day');
}

/** UTC bounds [start, end) of a shop-local calendar day. Handles 23 and 25 hour DST days. */
/** The ISO date `days` after (or before, when negative) a shop-local date. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  return isoDateOf(shopDayStart(isoDate).plus({ days }));
}

export function shopDayBounds(isoDate: string): { start: Date; end: Date } {
  const start = shopDayStart(isoDate);
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

/** Converts a shop-local wall-clock time on a date to a UTC Date. Nonexistent times (DST gap) move forward. */
export function shopLocalToUtc(isoDate: string, hhmm: string): Date {
  if (!HHMM_PATTERN.test(hhmm)) throw new RangeError(`Invalid HH:mm time: ${hhmm}`);
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return shopDayStart(isoDate).set({ hour: h, minute: m }).toJSDate();
}

/** A UTC instant viewed in the shop timezone. */
export function toShopTime(instant: Date): DateTime {
  return DateTime.fromJSDate(instant, { zone: SHOP_TIMEZONE });
}

/** Shop-local calendar day (YYYY-MM-DD) that a UTC instant falls on. */
export function shopDateOf(instant: Date): string {
  return toShopTime(instant).toISODate() ?? '';
}

/** Shop-local wall-clock time (HH:mm) of a UTC instant. */
export function shopTimeOf(instant: Date): string {
  return toShopTime(instant).toFormat('HH:mm');
}

/** Day key (mon..sun) of a UTC instant in shop time. */
export function shopDayKeyOf(instant: Date): DayKey {
  return dayKeyFromWeekday(toShopTime(instant).weekday);
}

/** Day key for a shop-local ISO date. */
export function dayKeyOfIsoDate(isoDate: string): DayKey {
  return dayKeyFromWeekday(shopDayStart(isoDate).weekday);
}

function dayKeyFromWeekday(weekday: number): DayKey {
  const key = DAY_KEYS[weekday - 1];
  if (!key) throw new RangeError(`Invalid weekday ${weekday}`);
  return key;
}

/** "Mon, Mar 9" style date for emails and the UI. */
export function formatShopDate(instant: Date): string {
  return toShopTime(instant).toFormat('ccc, LLL d');
}

/** "9:00 AM" style time for emails and the UI. */
export function formatShopTime(instant: Date): string {
  return toShopTime(instant).toFormat('h:mm a');
}

/** "Mon, Mar 9 at 9:00 AM" for confirmations. */
export function formatShopDateTime(instant: Date): string {
  return `${formatShopDate(instant)} at ${formatShopTime(instant)}`;
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function minutesBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 60_000;
}

/**
 * Rounds an instant down to a multiple of `stepMinutes` on the UTC minute grid.
 * The shop zone has whole-hour offsets, so a 15 minute grid in UTC is the same
 * grid in shop time, across DST.
 */
export function floorToStep(instant: Date, stepMinutes: number = LOCK_GRANULARITY_MINUTES): Date {
  assertStep(stepMinutes);
  const stepMs = stepMinutes * 60_000;
  return new Date(Math.floor(instant.getTime() / stepMs) * stepMs);
}

export function ceilToStep(instant: Date, stepMinutes: number = LOCK_GRANULARITY_MINUTES): Date {
  assertStep(stepMinutes);
  const stepMs = stepMinutes * 60_000;
  return new Date(Math.ceil(instant.getTime() / stepMs) * stepMs);
}

export function isOnStep(instant: Date, stepMinutes: number = LOCK_GRANULARITY_MINUTES): boolean {
  assertStep(stepMinutes);
  return instant.getTime() % (stepMinutes * 60_000) === 0;
}

function assertStep(stepMinutes: number): void {
  if (!Number.isInteger(stepMinutes) || stepMinutes <= 0) {
    throw new RangeError(`Invalid step ${stepMinutes}`);
  }
}

/**
 * Every lock block start covering [start, end). The range is widened outward to
 * the lock grid so partial blocks are fully locked.
 */
export function lockSlotStarts(start: Date, end: Date): Date[] {
  if (end.getTime() <= start.getTime()) return [];
  const first = floorToStep(start);
  const last = ceilToStep(end);
  const out: Date[] = [];
  for (let t = first.getTime(); t < last.getTime(); t += LOCK_GRANULARITY_MINUTES * 60_000) {
    out.push(new Date(t));
  }
  return out;
}

/** True when two [start, end) ranges overlap. */
export function rangesOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return Interval.fromDateTimes(a.start, a.end).overlaps(Interval.fromDateTimes(b.start, b.end));
}

/** Current instant. Wrapped so tests and services can inject a clock. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
