import type { WeekHours } from '@shared/schemas/common';
import { DAY_KEYS } from '@shared/lib/time';
import { hoursLabel } from '@/lib/hours';
import { DAY_NAMES, todayKey } from '@/lib/shop';

/** The week's hours with today highlighted. Keeps the exq-hours classes from the first build. */
export function HoursTable({ hours }: { hours: WeekHours }) {
  const today = todayKey();
  return (
    <dl className="exq-hours">
      {DAY_KEYS.map((day) => {
        const intervals = hours[day];
        return (
          <div
            key={day}
            className="exq-hours__row"
            data-state={intervals.length === 0 ? 'closed' : 'open'}
            data-today={day === today ? 'true' : 'false'}
          >
            <dt className="exq-hours__day">
              {DAY_NAMES[day]}
              {day === today ? <span className="exq-hours__today"> Today</span> : null}
            </dt>
            <dd className="exq-hours__times exq-num">{hoursLabel(intervals)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
