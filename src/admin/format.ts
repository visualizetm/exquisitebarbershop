import { DateTime } from 'luxon';
import { SHOP_TIMEZONE } from '@shared/lib/constants';
import { formatCents } from '@shared/lib/money';
import { formatUsPhone } from '@shared/lib/phone';
import type { BookingStatus } from '@shared/schemas/booking';

/** Every time on the dashboard is shown in shop time, whatever the device is set to. */
export function shopTime(iso: string): string {
  return DateTime.fromISO(iso, { zone: SHOP_TIMEZONE }).toFormat('h:mm a');
}

export function shopDateLabel(isoDate: string): string {
  return DateTime.fromISO(isoDate, { zone: SHOP_TIMEZONE }).toFormat('ccc, LLL d');
}

export function shopDateTime(iso: string): string {
  return DateTime.fromISO(iso, { zone: SHOP_TIMEZONE }).toFormat('ccc, LLL d, h:mm a');
}

export function todayInShop(): string {
  return DateTime.now().setZone(SHOP_TIMEZONE).toISODate() ?? '';
}

export function addDays(isoDate: string, days: number): string {
  return DateTime.fromISO(isoDate, { zone: SHOP_TIMEZONE }).plus({ days }).toISODate() ?? isoDate;
}

/** A shop-local date and HH:mm as a UTC ISO instant for the API. */
export function shopInstant(isoDate: string, hhmm: string): string {
  return DateTime.fromISO(`${isoDate}T${hhmm}`, { zone: SHOP_TIMEZONE }).toUTC().toISO() ?? '';
}

/** The shop-local date and HH:mm parts of an ISO instant, for form defaults. */
export function shopParts(iso: string): { date: string; time: string } {
  const dt = DateTime.fromISO(iso, { zone: SHOP_TIMEZONE });
  return { date: dt.toISODate() ?? '', time: dt.toFormat('HH:mm') };
}

export const money = formatCents;

export function phoneLabel(e164: string): string {
  return formatUsPhone(e164);
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  noShow: 'No show',
  cancelled: 'Cancelled',
};

/** Button copy for moving a booking to a status. Back to confirmed is always an undo. */
export const TRANSITION_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Undo, back to confirmed',
  completed: 'Mark completed',
  noShow: 'Mark no show',
  cancelled: 'Cancel booking',
};

export const SOURCE_LABEL: Record<string, string> = {
  online: 'Online',
  phone: 'Phone',
  walkIn: 'Walk-in',
};

export function newIdempotencyKey(): string {
  return `adm-${crypto.randomUUID()}`;
}
