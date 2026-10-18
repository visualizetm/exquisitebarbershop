import { useCallback, useState } from 'react';
import {
  staffMutationResponseSchema,
  type AdminServiceView,
  type AdminStaffView,
  type ConflictResolution,
} from '@shared/api/admin';
import { Button, Checkbox, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { ErrorNote } from '../components/ErrorNote';
import { money } from '../format';
import { Resolver } from '../panels/Resolver';
import { useConflictAction } from '../useConflictAction';

/** Which services this barber does. Taking one away goes through the resolver when upcoming bookings use it. */
export function ServicesTab({
  member,
  services,
  onChanged,
}: {
  member: AdminStaffView;
  services: AdminServiceView[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [chosen, setChosen] = useState<string[]>(member.serviceIds);
  const send = useCallback(
    (ids: string[], resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/staff/${member.id}`, staffMutationResponseSchema, {
        method: 'PATCH',
        body: { serviceIds: ids, ...(resolutions ? { resolutions } : {}) },
      }),
    [member.id],
  );
  const action = useConflictAction(send);
  const changed =
    chosen.length !== member.serviceIds.length ||
    chosen.some((id) => !member.serviceIds.includes(id));

  function saved() {
    onChanged();
    toast({ text: 'Services saved. Booking uses them right away.', tone: 'ok' });
  }

  return (
    <div className="exq-tabbody">
      <form
        className="exq-panelbody"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(chosen).then((ok) => {
            if (ok) saved();
          });
        }}
      >
        <fieldset className="exq-fieldset">
          <legend>Services {member.name} does</legend>
          {services.map((s) => (
            <Checkbox
              key={s.id}
              label={s.name}
              hint={`${s.durationMinutes} min, ${s.priceFrom ? 'from ' : ''}${money(s.priceCents)}${s.isActive ? '' : ', hidden'}`}
              checked={chosen.includes(s.id)}
              onChange={(e) => {
                setChosen(
                  e.target.checked ? [...chosen, s.id] : chosen.filter((id) => id !== s.id),
                );
              }}
            />
          ))}
        </fieldset>
        {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
        <div>
          <Button type="submit" loading={action.state.status === 'working'} disabled={!changed}>
            Save services
          </Button>
        </div>
      </form>
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
      ) : null}
    </div>
  );
}
