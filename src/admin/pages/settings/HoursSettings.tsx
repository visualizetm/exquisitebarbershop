import { useCallback, useState } from 'react';
import {
  conflictOnlyResponseSchema,
  hoursResponseSchema,
  type ConflictResolution,
} from '@shared/api/admin';
import type { WeekHours } from '@shared/schemas/common';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ConflictResolver } from '../../components/ConflictResolver';
import { ErrorNote } from '../../components/ErrorNote';
import { WeekHoursEditor } from '../../components/WeekHoursEditor';
import { useConflictAction } from '../../useConflictAction';

/** Shop opening hours. Each chair's own hours are edited under Staff. */
export function HoursSettings() {
  const [version, setVersion] = useState(0);
  const hours = useApi('/api/admin/hours', hoursResponseSchema, { version });
  return (
    <section
      className="exq-adm-hours"
      data-state={hours.status}
      aria-labelledby="exq-adm-hours-title"
    >
      <h2 id="exq-adm-hours-title">Shop hours</h2>
      <p>Each chair can only work inside these hours. Set each person's own days under Staff.</p>
      {hours.status !== 'ready' ? (
        <Status state={hours.status} />
      ) : (
        <ShopHoursForm
          key={version}
          initial={hours.data.shop}
          onSaved={() => {
            setVersion((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}

function ShopHoursForm({ initial, onSaved }: { initial: WeekHours; onSaved: () => void }) {
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
  return (
    <form
      className="exq-adm-hours__form"
      data-state={action.state.status}
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(days).then((ok) => {
          if (ok) onSaved();
        });
      }}
    >
      <WeekHoursEditor idPrefix="exq-adm-shop-hours" value={days} onChange={setDays} />
      <button type="submit" disabled={action.state.status === 'working'}>
        Save shop hours
      </button>
      {action.state.status === 'conflict' ? (
        <ConflictResolver
          affected={action.state.affected}
          working={false}
          onSubmit={(r) => {
            void action.resolve(r).then((ok) => {
              if (ok) onSaved();
            });
          }}
          onCancel={action.reset}
        />
      ) : null}
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
    </form>
  );
}
