import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  ceilToStep,
  dayKeyOfIsoDate,
  floorToStep,
  formatShopDateTime,
  isIsoDate,
  isoDateOf,
  lockSlotStarts,
  minutesBetween,
  rangesOverlap,
  shopDateOf,
  shopDayBounds,
  shopDayKeyOf,
  shopLocalToUtc,
  shopTimeOf,
} from '../../shared/lib/time';

describe('time: shop day bounds and DST', () => {
  it('converts a winter local time to UTC with a -5 offset', () => {
    expect(shopLocalToUtc('2026-01-15', '09:00').toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });

  it('converts a summer local time to UTC with a -4 offset', () => {
    expect(shopLocalToUtc('2026-07-15', '09:00').toISOString()).toBe('2026-07-15T13:00:00.000Z');
  });

  it('spring forward day is 23 hours long', () => {
    const { start, end } = shopDayBounds('2026-03-08');
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(minutesBetween(start, end)).toBe(23 * 60);
  });

  it('fall back day is 25 hours long', () => {
    const { start, end } = shopDayBounds('2026-11-01');
    expect(start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(minutesBetween(start, end)).toBe(25 * 60);
  });

  it('a time inside the spring forward gap moves forward', () => {
    // 02:30 does not exist on 2026-03-08 in New York; Luxon resolves it to 03:30 EDT.
    expect(shopLocalToUtc('2026-03-08', '02:30').toISOString()).toBe('2026-03-08T07:30:00.000Z');
  });

  it('09:00 on the DST change days maps correctly', () => {
    expect(shopLocalToUtc('2026-03-08', '09:00').toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(shopLocalToUtc('2026-11-01', '09:00').toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('maps UTC instants back to shop date, time and day key', () => {
    const instant = new Date('2026-07-15T03:30:00.000Z'); // 11:30 PM on July 14 in New York
    expect(shopDateOf(instant)).toBe('2026-07-14');
    expect(shopTimeOf(instant)).toBe('23:30');
    expect(shopDayKeyOf(instant)).toBe('tue');
    expect(dayKeyOfIsoDate('2026-03-08')).toBe('sun');
  });

  it('validates ISO dates including impossible ones', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26-01-01')).toBe(false);
  });

  it('formats for humans in shop time', () => {
    expect(formatShopDateTime(new Date('2026-03-09T13:00:00.000Z'))).toBe('Mon, Mar 9 at 9:00 AM');
  });

  it('isoDateOf throws on an invalid DateTime', () => {
    expect(isoDateOf(DateTime.fromISO('2026-03-10', { zone: 'America/New_York' }))).toBe(
      '2026-03-10',
    );
    expect(() => isoDateOf(DateTime.invalid('nope'))).toThrow(RangeError);
  });

  it('rejects invalid dates and times', () => {
    expect(() => shopDayBounds('2026-02-30')).toThrow(RangeError);
    expect(() => shopLocalToUtc('2026-02-10', '25:00')).toThrow(RangeError);
  });
});

describe('time: step rounding and lock slots', () => {
  it('floors and ceils to the 15 minute grid', () => {
    const t = new Date('2026-03-10T15:07:00.000Z');
    expect(floorToStep(t).toISOString()).toBe('2026-03-10T15:00:00.000Z');
    expect(ceilToStep(t).toISOString()).toBe('2026-03-10T15:15:00.000Z');
    expect(ceilToStep(new Date('2026-03-10T15:15:00.000Z')).toISOString()).toBe(
      '2026-03-10T15:15:00.000Z',
    );
  });

  it('produces one lock start per 15 minute block, widened to the grid', () => {
    const starts = lockSlotStarts(
      new Date('2026-03-10T15:00:00.000Z'),
      new Date('2026-03-10T15:50:00.000Z'),
    );
    expect(starts.map((d) => d.toISOString())).toEqual([
      '2026-03-10T15:00:00.000Z',
      '2026-03-10T15:15:00.000Z',
      '2026-03-10T15:30:00.000Z',
      '2026-03-10T15:45:00.000Z',
    ]);
  });

  it('returns nothing for an empty or reversed range', () => {
    const t = new Date('2026-03-10T15:00:00.000Z');
    expect(lockSlotStarts(t, t)).toEqual([]);
    expect(lockSlotStarts(new Date(t.getTime() + 1000), t)).toEqual([]);
  });

  it('lock grid stays aligned with shop time across DST', () => {
    const local = shopLocalToUtc('2026-11-01', '09:15');
    expect(floorToStep(local).getTime()).toBe(local.getTime());
  });

  it('detects overlapping ranges', () => {
    const a = { start: new Date('2026-03-10T15:00:00Z'), end: new Date('2026-03-10T15:30:00Z') };
    const b = { start: new Date('2026-03-10T15:30:00Z'), end: new Date('2026-03-10T16:00:00Z') };
    const c = { start: new Date('2026-03-10T15:15:00Z'), end: new Date('2026-03-10T15:45:00Z') };
    expect(rangesOverlap(a, b)).toBe(false);
    expect(rangesOverlap(a, c)).toBe(true);
  });
});
