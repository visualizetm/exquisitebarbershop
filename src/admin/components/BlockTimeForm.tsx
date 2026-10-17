import { useCallback, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { timeBlockResponseSchema, type ConflictResolution } from '@shared/api/admin';
import { apiRequest } from '@/lib/api';
import { shopInstant, todayInShop } from '../format';
import { useConflictAction } from '../useConflictAction';
import { ConflictResolver } from './ConflictResolver';
import { ErrorNote } from './ErrorNote';

interface Draft {
  staffId: string;
  kind: 'block' | 'timeOff';
  date: string;
  start: string;
  endDate: string;
  end: string;
  reason: string;
}

/**
 * Blocks time on one chair. A plain block hides the time from booking; time
 * off is longer and can span days. If clients are already booked in that time
 * the server answers with a conflict and the resolver asks what to do.
 */
export function BlockTimeForm({
  postPath,
  chairs,
  keepOnly = false,
  onDone,
}: {
  /** /api/admin/time-blocks for the owner, /api/me/time-blocks for a barber. */
  postPath: string;
  /** The chairs to choose from; a barber gets only their own. */
  chairs: { id: string; name: string }[];
  keepOnly?: boolean;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    staffId: chairs[0]?.id ?? '',
    kind: 'block',
    date: todayInShop(),
    start: '12:00',
    endDate: '',
    end: '13:00',
    reason: '',
  });

  const send = useCallback(
    (d: Draft, resolutions?: ConflictResolution[]) => {
      return apiRequest(postPath, timeBlockResponseSchema, {
        method: 'POST',
        body: {
          ...(chairs.length > 1 || postPath.includes('/admin/') ? { staffId: d.staffId } : {}),
          kind: d.kind,
          startAt: shopInstant(d.date, d.start),
          endAt: shopInstant(d.endDate || d.date, d.end),
          ...(d.reason.trim() ? { reason: d.reason.trim() } : {}),
          ...(resolutions ? { resolutions } : {}),
        },
      });
    },
    [postPath, chairs.length],
  );
  const action = useConflictAction(send);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (await action.run(draft)) onDone();
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="exq-adm-blockform" data-state={action.state.status}>
      <form className="exq-adm-blockform__form" onSubmit={(e) => void submit(e)}>
        {chairs.length > 1 ? (
          <p>
            <label htmlFor="exq-adm-block-chair">Chair</label>{' '}
            <select
              id="exq-adm-block-chair"
              value={draft.staffId}
              onChange={(e) => {
                set('staffId', e.target.value);
              }}
            >
              {chairs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </p>
        ) : null}
        <fieldset>
          <legend>Kind</legend>
          <label>
            <input
              type="radio"
              name="kind"
              checked={draft.kind === 'block'}
              onChange={() => {
                set('kind', 'block');
              }}
            />{' '}
            Block (lunch, off early, a break)
          </label>{' '}
          <label>
            <input
              type="radio"
              name="kind"
              checked={draft.kind === 'timeOff'}
              onChange={() => {
                set('kind', 'timeOff');
              }}
            />{' '}
            Time off
          </label>
        </fieldset>
        <p>
          <label htmlFor="exq-adm-block-date">Day</label>{' '}
          <input
            id="exq-adm-block-date"
            type="date"
            required
            value={draft.date}
            onChange={(e) => {
              set('date', e.target.value);
            }}
          />{' '}
          <label htmlFor="exq-adm-block-start">From</label>{' '}
          <input
            id="exq-adm-block-start"
            type="time"
            step={900}
            required
            value={draft.start}
            onChange={(e) => {
              set('start', e.target.value);
            }}
          />{' '}
          <label htmlFor="exq-adm-block-end">To</label>{' '}
          <input
            id="exq-adm-block-end"
            type="time"
            step={900}
            required
            value={draft.end}
            onChange={(e) => {
              set('end', e.target.value);
            }}
          />
        </p>
        {draft.kind === 'timeOff' ? (
          <p>
            <label htmlFor="exq-adm-block-enddate">Last day (leave empty for the same day)</label>{' '}
            <input
              id="exq-adm-block-enddate"
              type="date"
              value={draft.endDate}
              onChange={(e) => {
                set('endDate', e.target.value);
              }}
            />
          </p>
        ) : null}
        <p>
          <label htmlFor="exq-adm-block-reason">Reason (optional, staff only)</label>{' '}
          <input
            id="exq-adm-block-reason"
            maxLength={200}
            value={draft.reason}
            onChange={(e) => {
              set('reason', e.target.value);
            }}
          />
        </p>
        <button
          type="submit"
          className="exq-adm-blockform__submit"
          disabled={action.state.status === 'working'}
        >
          Block this time
        </button>
      </form>
      {action.state.status === 'conflict' ? (
        <ConflictResolver
          affected={action.state.affected}
          keepOnly={keepOnly}
          working={false}
          onSubmit={(r) => {
            void action.resolve(r).then((ok) => {
              if (ok) onDone();
            });
          }}
          onCancel={action.reset}
        />
      ) : null}
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
      {action.state.status === 'done' ? (
        <p className="exq-adm-blockform__done" role="status">
          Time blocked.
          {action.state.result.cancelled.length > 0
            ? ` ${action.state.result.cancelled.length} booking(s) cancelled.`
            : ''}
          {action.state.result.kept.length > 0
            ? ` ${action.state.result.kept.length} booking(s) kept as exceptions.`
            : ''}
        </p>
      ) : null}
    </div>
  );
}
