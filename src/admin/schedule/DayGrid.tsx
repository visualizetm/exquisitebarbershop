import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { DateTime } from 'luxon';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import type { ScheduleResponse } from '@shared/api/admin';
import { SHOP_TIMEZONE } from '@shared/lib/constants';
import { IconButton } from '@/components/ui';
import { firstNameLastInitial } from '../format';

const ROW = 24;
const SLOT_MINUTES = 15;

type Chair = ScheduleResponse['chairs'][number];

/** Minutes from the shop-local midnight to an instant. Real elapsed minutes, so DST days work. */
function minutesFrom(dayStart: DateTime, iso: string): number {
  return DateTime.fromISO(iso, { zone: SHOP_TIMEZONE }).diff(dayStart, 'minutes').minutes;
}

const clock = (dayStart: DateTime, minutes: number) => dayStart.plus({ minutes }).toFormat('h a');

/** The minute of the shop day it is now, or null when the grid is not showing today. */
function useNowMinutes(date: string): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(id);
    };
  }, []);
  const dayStart = DateTime.fromISO(date, { zone: SHOP_TIMEZONE }).startOf('day');
  const minutes = DateTime.fromMillis(now, { zone: SHOP_TIMEZONE }).diff(
    dayStart,
    'minutes',
  ).minutes;
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
}

/**
 * The day for every chair: a column each, from opening to closing in 15 minute rows. Bookings are
 * blocks (click one to open it), blocked time is hatched, time off and closed hours are gray, and a
 * red line marks now. Clicking an empty slot opens New booking with the chair and time filled in;
 * the plus in each chair header does the same from the keyboard. No dragging.
 */
export function DayGrid({
  schedule,
  onSlot,
  onBooking,
}: {
  schedule: ScheduleResponse;
  onSlot: (staffId: string, startAt: string) => void;
  onBooking: (id: string) => void;
}) {
  const dayStart = useMemo(
    () => DateTime.fromISO(schedule.date, { zone: SHOP_TIMEZONE }).startOf('day'),
    [schedule.date],
  );
  const nowMinutes = useNowMinutes(schedule.date);

  const { open, close } = useMemo(() => {
    const points: number[] = [];
    for (const chair of schedule.chairs) {
      for (const r of chair.working.ranges)
        points.push(minutesFrom(dayStart, r.startAt), minutesFrom(dayStart, r.endAt));
      for (const b of chair.bookings)
        points.push(minutesFrom(dayStart, b.startAt), minutesFrom(dayStart, b.endAt));
    }
    if (points.length === 0) return { open: 9 * 60, close: 18 * 60 };
    return {
      open: Math.floor(Math.min(...points) / 60) * 60,
      close: Math.ceil(Math.max(...points) / 60) * 60,
    };
  }, [schedule, dayStart]);

  const rows = Math.max(1, Math.round((close - open) / SLOT_MINUTES));
  const hours: number[] = [];
  for (let m = open; m < close; m += 60) hours.push(m);

  function slotClick(event: MouseEvent<HTMLDivElement>, chair: Chair) {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset.bg) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.max(0, Math.min(rows - 1, Math.floor((event.clientY - rect.top) / ROW)));
    const start = dayStart.plus({ minutes: open + index * SLOT_MINUTES });
    onSlot(chair.staff.id, start.toUTC().toISO() ?? '');
  }

  const top = (minutes: number) => ((minutes - open) / SLOT_MINUTES) * ROW;

  return (
    <div
      className="exq-daygrid"
      role="group"
      aria-label={`Schedule for ${schedule.date}`}
      style={
        {
          '--rows': rows,
          '--row-h': `${ROW}px`,
          '--cols': schedule.chairs.length,
        } as React.CSSProperties
      }
    >
      <div className="exq-daygrid__corner" />
      {schedule.chairs.map((chair) => (
        <div
          key={chair.staff.id}
          className="exq-daygrid__head"
          data-state={chair.working.ranges.length > 0 ? 'in' : 'off'}
        >
          <span>{chair.staff.name}</span>
          <IconButton
            label={`New booking for ${chair.staff.name}`}
            icon={<Plus aria-hidden="true" />}
            onClick={() => {
              onSlot(chair.staff.id, dayStart.plus({ minutes: open }).toUTC().toISO() ?? '');
            }}
          />
        </div>
      ))}
      <div className="exq-daygrid__ruler" style={{ height: rows * ROW }} aria-hidden="true">
        {hours.map((m) => (
          <span key={m} style={{ top: top(m) }}>
            {clock(dayStart, m)}
          </span>
        ))}
      </div>
      {schedule.chairs.map((chair) => {
        const working = chair.working.ranges.map(
          (r) => [minutesFrom(dayStart, r.startAt), minutesFrom(dayStart, r.endAt)] as const,
        );
        // The time outside working hours is gray: everything between the working ranges.
        const gaps: [number, number][] = [];
        let cursor = open;
        for (const [s, e] of [...working].sort((a, b) => a[0] - b[0])) {
          if (s > cursor) gaps.push([cursor, Math.min(s, close)]);
          cursor = Math.max(cursor, e);
        }
        if (cursor < close) gaps.push([cursor, close]);
        return (
          <div
            key={chair.staff.id}
            className="exq-daygrid__col"
            data-bg="true"
            style={{ height: rows * ROW }}
            onClick={(e) => {
              slotClick(e, chair);
            }}
          >
            {hours.map((m) => (
              <div
                key={`line-${String(m)}`}
                className="exq-daygrid__line"
                data-bg="true"
                style={{ top: top(m) }}
              />
            ))}
            {gaps.map(([s, e]) => (
              <div
                key={s}
                className="exq-daygrid__off"
                data-bg="true"
                style={{ top: top(s), height: ((e - s) / SLOT_MINUTES) * ROW }}
              >
                {working.length === 0 && s === open
                  ? chair.working.reason === 'closed'
                    ? 'Closed'
                    : 'Off today'
                  : null}
              </div>
            ))}
            {chair.blocks
              .filter((b) => b.kind !== 'extraHours')
              .map((b) => {
                const s = Math.max(open, minutesFrom(dayStart, b.startAt));
                const e = Math.min(close, minutesFrom(dayStart, b.endAt));
                if (e <= s) return null;
                return (
                  <div
                    key={b.id}
                    className="exq-daygrid__block"
                    data-kind={b.kind}
                    style={{ top: top(s), height: ((e - s) / SLOT_MINUTES) * ROW }}
                  >
                    {b.kind === 'block' ? (
                      <svg className="exq-daygrid__hatch" aria-hidden="true">
                        <defs>
                          <pattern
                            id={`hatch-${b.id}`}
                            width="8"
                            height="8"
                            patternUnits="userSpaceOnUse"
                            patternTransform="rotate(45)"
                          >
                            <line
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="8"
                              stroke="currentColor"
                              strokeWidth="3"
                            />
                          </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill={`url(#hatch-${b.id})`} />
                      </svg>
                    ) : null}
                    <span className="exq-daygrid__blocklabel">
                      {b.kind === 'block' ? 'Blocked' : 'Time off'}
                      {b.reason ? `: ${b.reason}` : ''}
                    </span>
                  </div>
                );
              })}
            {chair.bookings
              .filter((b) => b.status !== 'cancelled')
              .map((b) => {
                const s = minutesFrom(dayStart, b.startAt);
                const e = minutesFrom(dayStart, b.endAt);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="exq-daygrid__booking"
                    data-status={b.status}
                    style={{
                      top: top(s),
                      height: Math.max(ROW, ((e - s) / SLOT_MINUTES) * ROW) - 2,
                    }}
                    onClick={() => {
                      onBooking(b.id);
                    }}
                  >
                    <b>{firstNameLastInitial(b.customer.name)}</b>
                    <span>{b.services.map((x) => x.name).join(', ')}</span>
                  </button>
                );
              })}
          </div>
        );
      })}
      {nowMinutes !== null && nowMinutes >= open && nowMinutes <= close ? (
        <div
          className="exq-daygrid__now"
          style={{ top: `calc(44px + ${top(nowMinutes)}px)` }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
