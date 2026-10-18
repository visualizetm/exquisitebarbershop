import { useCallback, useState } from 'react';
import {
  conflictOnlyResponseSchema,
  type AdminStaffView,
  type ConflictResolution,
} from '@shared/api/admin';
import type { WeekHours } from '@shared/schemas/common';
import { Button, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { ErrorNote } from '../components/ErrorNote';
import { WeekHoursEditor } from '../components/WeekHoursEditor';
import { Resolver } from '../panels/Resolver';
import { useConflictAction } from '../useConflictAction';

/** Weekly working hours. They are limited by the shop hours; a change that strands bookings asks first. */
export function HoursTab({
  member,
  hours,
  onChanged,
}: {
  member: AdminStaffView;
  hours: WeekHours;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [days, setDays] = useState(hours);
  const send = useCallback(
    (value: WeekHours, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/staff/${member.id}/hours`, conflictOnlyResponseSchema, {
        method: 'PUT',
        body: { days: value, ...(resolutions ? { resolutions } : {}) },
      }),
    [member.id],
  );
  const action = useConflictAction(send);
  function saved() {
    onChanged();
    toast({ text: `${member.name}'s hours are saved.`, tone: 'ok' });
  }
  return (
    <div className="exq-tabbody">
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
            These are limited by the shop hours. A day with no hours means {member.name} is not in.
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
    </div>
  );
}
