import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { myScheduleResponseSchema } from '@shared/api/admin';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { BlockTimeForm } from '../components/BlockTimeForm';
import { BookingList } from '../components/BookingList';
import { TimeBlockItem } from '../components/TimeBlockItem';
import { addDays, shopDateLabel, shopTime, todayInShop } from '../format';

/** A barber's own chair only. The server scopes every request to their chair whatever is asked. */
export function MySchedulePage() {
  usePageTitle('My schedule');
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? todayInShop();
  const days = params.get('view') === 'week' ? 7 : 1;
  const [version, setVersion] = useState(0);
  const [blocking, setBlocking] = useState(false);
  const schedule = useApi(`/api/me/schedule?date=${date}&days=${days}`, myScheduleResponseSchema, {
    version,
  });

  function go(next: { date?: string; view?: 'day' | 'week' }) {
    setParams(
      { date: next.date ?? date, view: next.view ?? (days === 7 ? 'week' : 'day') },
      { replace: true },
    );
  }

  return (
    <article
      className="exq-adm-mine"
      data-state={schedule.status}
      data-view={days === 7 ? 'week' : 'day'}
    >
      <h1 className="exq-adm-mine__title">
        My schedule{schedule.status === 'ready' ? `, ${schedule.data.staff.name}` : ''}
      </h1>
      <p className="exq-adm-mine__controls">
        <button
          type="button"
          onClick={() => {
            go({ date: addDays(date, -days) });
          }}
        >
          Back
        </button>{' '}
        <input
          type="date"
          aria-label="Day"
          value={date}
          onChange={(e) => {
            if (e.target.value) go({ date: e.target.value });
          }}
        />{' '}
        <button
          type="button"
          onClick={() => {
            go({ date: addDays(date, days) });
          }}
        >
          Forward
        </button>{' '}
        <button
          type="button"
          data-state={days === 1 ? 'active' : 'idle'}
          onClick={() => {
            go({ view: 'day' });
          }}
        >
          Day
        </button>{' '}
        <button
          type="button"
          data-state={days === 7 ? 'active' : 'idle'}
          onClick={() => {
            go({ view: 'week' });
          }}
        >
          Week
        </button>
      </p>
      {schedule.status !== 'ready' ? (
        <Status state={schedule.status} />
      ) : (
        <>
          {schedule.data.canBlockTime ? (
            <section className="exq-adm-mine__block" data-state={blocking ? 'open' : 'closed'}>
              {blocking ? (
                <BlockTimeForm
                  postPath="/api/me/time-blocks"
                  chairs={[{ id: schedule.data.staff.id, name: schedule.data.staff.name }]}
                  keepOnly
                  onDone={() => {
                    setVersion((v) => v + 1);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setBlocking(true);
                  }}
                >
                  Block some of my time
                </button>
              )}
            </section>
          ) : null}
          {schedule.data.days.map((day) => (
            <section
              key={day.date}
              className="exq-adm-mine__day"
              data-state={day.working.ranges.length > 0 ? 'working' : 'off'}
              aria-labelledby={`exq-adm-mine-${day.date}`}
            >
              <h2 id={`exq-adm-mine-${day.date}`}>{shopDateLabel(day.date)}</h2>
              <p className="exq-adm-mine__hours">
                {day.working.ranges.length > 0
                  ? day.working.ranges
                      .map((r) => `${shopTime(r.startAt)} to ${shopTime(r.endAt)}`)
                      .join(', ')
                  : day.working.reason === 'closed'
                    ? 'Shop closed'
                    : 'Not working'}
              </p>
              <BookingList
                bookings={day.bookings}
                linkBase="/admin/me/bookings"
                showChair={false}
              />
              {day.blocks.length > 0 ? (
                <ul className="exq-adm-mine__blocks">
                  {day.blocks.map((b) => (
                    <TimeBlockItem
                      key={b.id}
                      block={b}
                      keepOnly
                      deletePath={
                        schedule.data.canBlockTime && (b.kind === 'block' || b.kind === 'timeOff')
                          ? `/api/me/time-blocks/${b.id}`
                          : null
                      }
                      onChanged={() => {
                        setVersion((v) => v + 1);
                      }}
                    />
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </>
      )}
    </article>
  );
}
