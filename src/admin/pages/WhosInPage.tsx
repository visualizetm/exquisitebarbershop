import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  dayStatusResponseSchema,
  whoIsInResponseSchema,
  type ConflictResolution,
  type WhoIsInEntry,
} from '@shared/api/admin';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { ConflictResolver } from '../components/ConflictResolver';
import { ErrorNote } from '../components/ErrorNote';
import { addDays, shopDateLabel, shopTime, todayInShop } from '../format';
import { useConflictAction } from '../useConflictAction';

interface DayChange {
  status: 'in' | 'out';
  hours: { start: string; end: string } | null;
}

/** Toggle each chair in or out for a day, or add hours on a day they do not normally work. */
export function WhosInPage() {
  usePageTitle("Who's in");
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? todayInShop();
  const [version, setVersion] = useState(0);
  const who = useApi(`/api/admin/whos-in?date=${date}`, whoIsInResponseSchema, { version });

  return (
    <article className="exq-adm-whosin" data-state={who.status}>
      <h1 className="exq-adm-whosin__title">Who's in, {shopDateLabel(date)}</h1>
      <p className="exq-adm-whosin__controls">
        <button
          type="button"
          onClick={() => {
            setParams({ date: addDays(date, -1) }, { replace: true });
          }}
        >
          Previous day
        </button>{' '}
        <label htmlFor="exq-adm-whosin-date">Day</label>{' '}
        <input
          id="exq-adm-whosin-date"
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) setParams({ date: e.target.value }, { replace: true });
          }}
        />{' '}
        <button
          type="button"
          onClick={() => {
            setParams({ date: addDays(date, 1) }, { replace: true });
          }}
        >
          Next day
        </button>
      </p>
      {who.status !== 'ready' ? (
        <Status state={who.status} />
      ) : (
        <ul className="exq-adm-whosin__list">
          {who.data.entries.map((entry) => (
            <WhoRow
              key={`${entry.staff.id}-${date}`}
              entry={entry}
              date={date}
              onChanged={() => {
                setVersion((v) => v + 1);
              }}
            />
          ))}
        </ul>
      )}
    </article>
  );
}

function WhoRow({
  entry,
  date,
  onChanged,
}: {
  entry: WhoIsInEntry;
  date: string;
  onChanged: () => void;
}) {
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('16:00');

  const send = useCallback(
    (change: DayChange, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/staff/${entry.staff.id}/day`, dayStatusResponseSchema, {
        method: 'POST',
        body: {
          date,
          status: change.status,
          ...(change.hours ? { start: change.hours.start, end: change.hours.end } : {}),
          ...(resolutions ? { resolutions } : {}),
        },
      }),
    [entry.staff.id, date],
  );
  const action = useConflictAction(send);

  async function change(next: DayChange) {
    if (await action.run(next)) onChanged();
  }

  const hours = entry.working.ranges
    .map((r) => `${shopTime(r.startAt)} to ${shopTime(r.endAt)}`)
    .join(', ');

  return (
    <li
      className="exq-adm-whosin__row"
      data-state={entry.status}
      data-day-off={entry.dayOff ? 'true' : 'false'}
      data-extra={entry.extraHours ? 'true' : 'false'}
    >
      <span className="exq-adm-whosin__name">{entry.staff.name}</span>:{' '}
      <span className="exq-adm-whosin__status">
        {entry.status === 'in' ? `In, ${hours}` : entry.status === 'closed' ? 'Shop closed' : 'Out'}
      </span>{' '}
      {entry.status === 'in' ? (
        <button
          type="button"
          className="exq-adm-whosin__out"
          disabled={action.state.status === 'working'}
          onClick={() => void change({ status: 'out', hours: null })}
        >
          Mark out for the day
        </button>
      ) : null}
      {entry.status !== 'in' && entry.dayOff ? (
        <button
          type="button"
          className="exq-adm-whosin__in"
          disabled={action.state.status === 'working'}
          onClick={() => void change({ status: 'in', hours: null })}
        >
          Mark back in
        </button>
      ) : null}
      {entry.status !== 'closed' ? (
        <form
          className="exq-adm-whosin__extra"
          onSubmit={(e) => {
            e.preventDefault();
            void change({ status: 'in', hours: { start, end } });
          }}
        >
          <label htmlFor={`exq-adm-extra-start-${entry.staff.id}`}>Extra hours from</label>{' '}
          <input
            id={`exq-adm-extra-start-${entry.staff.id}`}
            type="time"
            step={900}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
            }}
          />{' '}
          <label htmlFor={`exq-adm-extra-end-${entry.staff.id}`}>to</label>{' '}
          <input
            id={`exq-adm-extra-end-${entry.staff.id}`}
            type="time"
            step={900}
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
            }}
          />{' '}
          <button type="submit" disabled={action.state.status === 'working'}>
            Add hours
          </button>
        </form>
      ) : null}
      {action.state.status === 'conflict' ? (
        <ConflictResolver
          affected={action.state.affected}
          working={false}
          onSubmit={(r) => {
            void action.resolve(r).then((ok) => {
              if (ok) onChanged();
            });
          }}
          onCancel={action.reset}
        />
      ) : null}
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
    </li>
  );
}
