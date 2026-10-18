import { useCallback, useState } from 'react';
import Trash01 from '@untitled-ui/icons-react/build/esm/Trash01';
import {
  closureListResponseSchema,
  closureResponseSchema,
  conflictOnlyResponseSchema,
  hoursResponseSchema,
  type ConflictResolution,
} from '@shared/api/admin';
import type { WeekHours } from '@shared/schemas/common';
import { Button, Chip, Chips, EmptyState, IconButton, Input, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';
import { WeekHoursEditor } from '../components/WeekHoursEditor';
import { shopDateLabel, todayInShop } from '../format';
import { Resolver } from '../panels/Resolver';
import { useConflictAction } from '../useConflictAction';

/**
 * Opening hours for every weekday, and days the shop is closed (or open on other hours) with a
 * reason. A change that would leave booked clients outside the hours goes through the resolver
 * before anything is saved.
 */
export function HoursPanel() {
  const [version, setVersion] = useState(0);
  const refresh = () => {
    setVersion((v) => v + 1);
  };
  return (
    <div className="exq-tabbody exq-tabbody--wide">
      <WeeklyHours version={version} onSaved={refresh} />
      <ClosedDays version={version} onChanged={refresh} />
    </div>
  );
}

function WeeklyHours({ version, onSaved }: { version: number; onSaved: () => void }) {
  const hours = useApi('/api/admin/hours', hoursResponseSchema, { version });
  if (hours.status !== 'ready')
    return <Status state={hours.status === 'error' ? 'error' : 'loading'} />;
  return <WeeklyHoursForm key={version} initial={hours.data.shop} onSaved={onSaved} />;
}

function WeeklyHoursForm({ initial, onSaved }: { initial: WeekHours; onSaved: () => void }) {
  const toast = useToast();
  const [days, setDays] = useState(initial);
  const send = useCallback(
    (value: WeekHours, resolutions?: ConflictResolution[]) =>
      apiRequest('/api/admin/hours', conflictOnlyResponseSchema, {
        method: 'PUT',
        body: { days: value, ...(resolutions ? { resolutions } : {}) },
      }),
    [],
  );
  const action = useConflictAction(send);
  function saved() {
    onSaved();
    toast({ text: 'Shop hours saved. The site shows them right away.', tone: 'ok' });
  }
  return (
    <section aria-labelledby="exq-hours-week">
      <h2 id="exq-hours-week" className="exq-bsheet__h">
        Weekly hours
      </h2>
      {action.state.status === 'conflict' ? (
        <Resolver
          affected={action.state.affected}
          working={false}
          onBack={action.reset}
          onSubmit={(r) => {
            void action.resolve(r).then((ok) => {
              if (ok) saved();
            });
          }}
        />
      ) : (
        <form
          className="exq-panelbody"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(days).then((ok) => {
              if (ok) saved();
            });
          }}
        >
          <p className="exq-muted">
            A day with no hours is closed. Each barber's own hours are limited by these.
          </p>
          <WeekHoursEditor value={days} onChange={setDays} />
          {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
          <div>
            <Button type="submit" loading={action.state.status === 'working'}>
              Save hours
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

interface ClosureDraft {
  date: string;
  kind: 'closed' | 'specialHours';
  start: string;
  end: string;
  label: string;
}

function ClosedDays({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const closures = useApi('/api/admin/closures', closureListResponseSchema, { version });
  const [draft, setDraft] = useState<ClosureDraft>({
    date: todayInShop(),
    kind: 'closed',
    start: '10:00',
    end: '14:00',
    label: '',
  });
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
  const set = <K extends keyof ClosureDraft>(key: K, value: ClosureDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };
  function saved() {
    onChanged();
    toast({ text: `${shopDateLabel(draft.date)} is saved.`, tone: 'ok' });
  }

  return (
    <section aria-labelledby="exq-hours-closed">
      <h2 id="exq-hours-closed" className="exq-bsheet__h">
        Closed days and special hours
      </h2>
      {saving.state.status === 'conflict' ? (
        <Resolver
          affected={saving.state.affected}
          working={false}
          onBack={saving.reset}
          onSubmit={(r) => {
            void saving.resolve(r).then((ok) => {
              if (ok) saved();
            });
          }}
        />
      ) : (
        <form
          className="exq-panelbody"
          onSubmit={(e) => {
            e.preventDefault();
            void saving.run(draft).then((ok) => {
              if (ok) saved();
            });
          }}
        >
          <div className="exq-panelbody__row">
            <Input
              label="Day"
              type="date"
              required
              value={draft.date}
              onChange={(e) => {
                set('date', e.target.value);
              }}
            />
            <Input
              label="Reason"
              required
              maxLength={80}
              placeholder="Thanksgiving"
              value={draft.label}
              onChange={(e) => {
                set('label', e.target.value);
              }}
            />
          </div>
          <Chips label="Kind">
            <Chip
              selected={draft.kind === 'closed'}
              onClick={() => {
                set('kind', 'closed');
              }}
            >
              Closed all day
            </Chip>
            <Chip
              selected={draft.kind === 'specialHours'}
              onClick={() => {
                set('kind', 'specialHours');
              }}
            >
              Special hours
            </Chip>
          </Chips>
          {draft.kind === 'specialHours' ? (
            <div className="exq-panelbody__row">
              <Input
                label="Opens"
                type="time"
                step={900}
                value={draft.start}
                onChange={(e) => {
                  set('start', e.target.value);
                }}
              />
              <Input
                label="Closes"
                type="time"
                step={900}
                value={draft.end}
                onChange={(e) => {
                  set('end', e.target.value);
                }}
              />
            </div>
          ) : null}
          {saving.state.status === 'error' ? <ErrorNote error={saving.state.error} /> : null}
          <div>
            <Button type="submit" loading={saving.state.status === 'working'}>
              Save day
            </Button>
          </div>
        </form>
      )}

      {closures.status !== 'ready' ? (
        <Status state={closures.status === 'error' ? 'error' : 'loading'} />
      ) : closures.data.closures.length === 0 ? (
        <EmptyState title="No closed days coming up">
          Add a holiday above and it shows on the site.
        </EmptyState>
      ) : (
        <ul className="exq-closures exq-bare">
          {closures.data.closures.map((c) => (
            <ClosureRow
              key={c.id}
              id={c.id}
              text={`${shopDateLabel(c.date)}: ${c.label}, ${c.kind === 'closed' ? 'closed' : c.intervals.map((i) => `${i.start} to ${i.end}`).join(', ')}`}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ClosureRow({ id, text, onChanged }: { id: string; text: string; onChanged: () => void }) {
  const toast = useToast();
  const send = useCallback(
    (_r: null, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/closures/${id}`, conflictOnlyResponseSchema, {
        method: 'DELETE',
        body: resolutions ? { resolutions } : {},
      }),
    [id],
  );
  const removal = useConflictAction(send);
  function removed() {
    onChanged();
    toast({ text: 'Removed.', tone: 'ok' });
  }
  return (
    <li className="exq-closures__item">
      <span>{text}</span>
      <IconButton
        label={`Remove ${text}`}
        icon={<Trash01 aria-hidden="true" />}
        disabled={removal.state.status === 'working'}
        onClick={() => {
          void removal.run(null).then((ok) => {
            if (ok) removed();
          });
        }}
      />
      {removal.state.status === 'conflict' ? (
        <div className="exq-closures__resolver">
          <Resolver
            affected={removal.state.affected}
            working={false}
            onBack={removal.reset}
            onSubmit={(r) => {
              void removal.resolve(r).then((ok) => {
                if (ok) removed();
              });
            }}
          />
        </div>
      ) : null}
      {removal.state.status === 'error' ? <ErrorNote error={removal.state.error} /> : null}
    </li>
  );
}
