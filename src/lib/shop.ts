import { DateTime } from 'luxon';
import type { PublicShop } from '@shared/api/public';
import { SHOP_TIMEZONE } from '@shared/lib/constants';
import { DAY_KEYS, type DayKey } from '@shared/lib/time';

/** A Google Maps search link for the shop address. A plain link, no embed. */
export function directionsUrl(address: PublicShop['address']): string {
  const query = [address.line1, address.line2, address.city, address.state, address.postalCode]
    .filter(Boolean)
    .join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Today's key in shop time, so the hours table highlights the right row for every visitor. */
export function todayKey(now: Date = new Date()): DayKey {
  const weekday = DateTime.fromJSDate(now).setZone(SHOP_TIMEZONE).weekday; // 1 is Monday
  return DAY_KEYS[weekday - 1] ?? 'mon';
}

export const DAY_NAMES: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
