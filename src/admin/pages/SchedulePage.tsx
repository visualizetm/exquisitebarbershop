import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { scheduleResponseSchema, staffListResponseSchema } from '@shared/api/admin';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { BookingList } from '../components/BookingList';
import { TimeBlockItem } from '../components/TimeBlockItem';
import { addDays, shopDateLabel, shopTime, todayInShop } from '../format';

/** The day view for every chair, or one chair picked with the switcher. */
export function SchedulePage() {
  usePageTitle('Schedule');
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? todayInShop();
  const staffId = params.get('staffId') ?? '';
  const [version, setVersion] = useState(0);
  const staff = useApi('/api/admin/staff', staffListResponseSchema);
  const query = new URLSearchParams({ date });
  if (staffId) query.set('staffId', staffId);
  const schedule = useApi(`/api/admin/schedule?${query.toString()}`, scheduleResponseSchema, {
    version,
  });

  function update(next: { date?: string; staffId?: string }) {
    const merged = new URLSearchParams(params);
    if (next.date !== undefined) merged.set('date', next.date);
    if (next.staffId !== undefined) {
      if (next.staffId) merged.set('staffId', next.staffId);
      else merged.delete('staffId');
    }
    setParams(merged, { replace: true });
  }

  const chairs = staff.status === 'ready' ? staff.data.staff.filter((s) => !s.deletedAt) : [];

  return (
    <article className="exq-adm-schedule" data-state={schedule.status}>
      <h1 className="exq-adm-schedule__title">Schedule, {shopDateLabel(date)}</h1>
      <form
        className="exq-adm-schedule__controls"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <button
          type="button"
          className="exq-adm-schedule__prev"
          onClick={() => {
            update({ date: addDays(date, -1) });
          }}
        >
          Previous day
        </button>{' '}
        <label htmlFor="exq-adm-schedule-date">Day</label>{' '}
        <input
          id="exq-adm-schedule-date"
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) update({ date: e.target.value });
          }}
        />{' '}
        <button
          type="button"
          className="exq-adm-schedule__next"
          onClick={() => {
            update({ date: addDays(date, 1) });
          }}
        >
          Next day
        </button>{' '}
        <label htmlFor="exq-adm-schedule-chair">Chair</label>{' '}
        <select
          id="exq-adm-schedule-chair"
          className="exq-adm-schedule__chair"
          value={staffId}
          onChange={(e) => {
            update({ staffId: e.target.value });
          }}
        >
          <option value="">All chairs</option>
          {chairs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </form>
      {schedule.status !== 'ready' ? (
        <Status state={schedule.status} />
      ) : (
        schedule.data.chairs.map((chair) => (
          <section
            key={chair.staff.id}
            className="exq-adm-schedule__chair-day"
            data-state={
              chair.working.ranges.length > 0 ? 'working' : (chair.working.reason ?? 'off')
            }
            aria-labelledby={`exq-adm-chair-${chair.staff.id}`}
          >
            <h2 id={`exq-adm-chair-${chair.staff.id}`} className="exq-adm-schedule__chair-name">
              {chair.staff.name}
            </h2>
            <p className="exq-adm-schedule__hours">
              {chair.working.ranges.length > 0
                ? chair.working.ranges
                    .map((r) => `${shopTime(r.startAt)} to ${shopTime(r.endAt)}`)
                    .join(', ')
                : chair.working.reason === 'closed'
                  ? 'Shop closed'
                  : 'Not working'}
            </p>
            <BookingList bookings={chair.bookings} linkBase="/admin/bookings" showChair={false} />
            {chair.blocks.length > 0 ? (
              <ul className="exq-adm-schedule__blocks">
                {chair.blocks.map((b) => (
                  <TimeBlockItem
                    key={b.id}
                    block={b}
                    deletePath={`/api/admin/time-blocks/${b.id}`}
                    onChanged={() => {
                      setVersion((v) => v + 1);
                    }}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        ))
      )}
    </article>
  );
}
