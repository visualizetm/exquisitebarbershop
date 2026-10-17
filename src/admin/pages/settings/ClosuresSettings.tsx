import { useCallback, useState } from 'react';
import {
  closureListResponseSchema,
  closureResponseSchema,
  conflictOnlyResponseSchema,
  type ConflictResolution,
} from '@shared/api/admin';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ConflictResolver } from '../../components/ConflictResolver';
import { ErrorNote } from '../../components/ErrorNote';
import { shopDateLabel, todayInShop } from '../../format';
import { useConflictAction } from '../../useConflictAction';

interface ClosureDraft {
  date: string;
  kind: 'closed' | 'specialHours';
  start: string;
  end: string;
  label: string;
}

/** Holidays and special hours for the whole shop. One entry per day; saving a day replaces it. */
export function ClosuresSettings() {
  const [version, setVersion] = useState(0);
  const closures = useApi('/api/admin/closures', closureListResponseSchema, { version });
  const [draft, setDraft] = useState<ClosureDraft>({
    date: todayInShop(),
    kind: 'closed',
    start: '10:00',
    end: '14:00',
    label: '',
  });
  const refresh = () => {
    setVersion((v) => v + 1);
  };

  const save = useCallback(
    (d: ClosureDraft, resolutions?: ConflictResolution[]) =>
      apiRequest('/api/admin/closures', closureResponseSchema, {
        method: 'PUT',
        body: {
          date: d.date,
          kind: d.kind,
          intervals: d.kind === 'specialHours' ? [{ start: d.start, end: d.end }] : [],
          label: d.label.trim(),
          ...(resolutions ? { resolutions } : {}),
        },
      }),
    [],
  );
  const saving = useConflictAction(save);

  function set<K extends keyof ClosureDraft>(key: K, value: ClosureDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section
      className="exq-adm-closures"
      data-state={closures.status}
      aria-labelledby="exq-adm-closures-title"
    >
      <h2 id="exq-adm-closures-title">Closures and special hours</h2>
      <form
        className="exq-adm-closures__form"
        data-state={saving.state.status}
        onSubmit={(e) => {
          e.preventDefault();
          void saving.run(draft).then((ok) => {
            if (ok) refresh();
          });
        }}
      >
        <p>
          <label htmlFor="exq-adm-closure-date">Day</label>{' '}
          <input
            id="exq-adm-closure-date"
            type="date"
            required
            value={draft.date}
            onChange={(e) => {
              set('date', e.target.value);
            }}
          />{' '}
          <label htmlFor="exq-adm-closure-label">Label</label>{' '}
          <input
            id="exq-adm-closure-label"
            required
            maxLength={80}
            placeholder="Thanksgiving"
            value={draft.label}
            onChange={(e) => {
              set('label', e.target.value);
            }}
          />
        </p>
        <fieldset>
          <legend>Kind</legend>
          <label>
            <input
              type="radio"
              name="closure-kind"
              checked={draft.kind === 'closed'}
              onChange={() => {
                set('kind', 'closed');
              }}
            />{' '}
            Closed all day
          </label>{' '}
          <label>
            <input
              type="radio"
              name="closure-kind"
              checked={draft.kind === 'specialHours'}
              onChange={() => {
                set('kind', 'specialHours');
              }}
            />{' '}
            Special hours
          </label>
        </fieldset>
        {draft.kind === 'specialHours' ? (
          <p>
            <label htmlFor="exq-adm-closure-start">Open</label>{' '}
            <input
              id="exq-adm-closure-start"
              type="time"
              step={900}
              value={draft.start}
              onChange={(e) => {
                set('start', e.target.value);
              }}
            />{' '}
            <label htmlFor="exq-adm-closure-end">Close</label>{' '}
            <input
              id="exq-adm-closure-end"
              type="time"
              step={900}
              value={draft.end}
              onChange={(e) => {
                set('end', e.target.value);
              }}
            />
          </p>
        ) : null}
        <button type="submit" disabled={saving.state.status === 'working'}>
          Save day
        </button>
        {saving.state.status === 'conflict' ? (
          <ConflictResolver
            affected={saving.state.affected}
            working={false}
            onSubmit={(r) => {
              void saving.resolve(r).then((ok) => {
                if (ok) refresh();
              });
            }}
            onCancel={saving.reset}
          />
        ) : null}
        {saving.state.status === 'error' ? <ErrorNote error={saving.state.error} /> : null}
      </form>
      {closures.status !== 'ready' ? (
        <Status state={closures.status} />
      ) : closures.data.closures.length === 0 ? (
        <Status state="empty" message="No closures coming up." />
      ) : (
        <ul className="exq-adm-closures__list">
          {closures.data.closures.map((c) => (
            <ClosureRow
              key={c.id}
              id={c.id}
              text={`${shopDateLabel(c.date)}: ${c.label}, ${
                c.kind === 'closed'
                  ? 'closed'
                  : c.intervals.map((i) => `${i.start} to ${i.end}`).join(', ')
              }`}
              kind={c.kind}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ClosureRow({
  id,
  text,
  kind,
  onChanged,
}: {
  id: string;
  text: string;
  kind: string;
  onChanged: () => void;
}) {
  const send = useCallback(
    (_r: null, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/closures/${id}`, conflictOnlyResponseSchema, {
        method: 'DELETE',
        body: resolutions ? { resolutions } : {},
      }),
    [id],
  );
  const removal = useConflictAction(send);
  return (
    <li className="exq-adm-closures__item" data-state={kind}>
      {text}{' '}
      <button
        type="button"
        disabled={removal.state.status === 'working'}
        onClick={() => {
          void removal.run(null).then((ok) => {
            if (ok) onChanged();
          });
        }}
      >
        Remove
      </button>
      {removal.state.status === 'conflict' ? (
        <ConflictResolver
          affected={removal.state.affected}
          working={false}
          onSubmit={(r) => {
            void removal.resolve(r).then((ok) => {
              if (ok) onChanged();
            });
          }}
          onCancel={removal.reset}
        />
      ) : null}
      {removal.state.status === 'error' ? <ErrorNote error={removal.state.error} /> : null}
    </li>
  );
}
