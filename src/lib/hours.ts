import type { WeekHours } from '@shared/schemas/common';
import type { DayKey } from '@shared/lib/time';

/** "9 AM" or "9:30 AM" from "HH:mm". */
export function to12Hour(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "9 AM to 7 PM", "Closed", or several ranges joined with commas. */
export function hoursLabel(intervals: WeekHours[DayKey]): string {
  if (intervals.length === 0) return 'Closed';
  return intervals.map((i) => `${to12Hour(i.start)} to ${to12Hour(i.end)}`).join(', ');
}
