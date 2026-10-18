import { useCallback, useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  dayStatusResponseSchema,
  staffListResponseSchema,
  type ConflictResolution,
} from '@shared/api/admin';
import { Button, Input, Select, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';
import { shopDateLabel, todayInShop } from '../format';
import { useConflictAction } from '../useConflictAction';
import { useQuick } from '../shell/quick';
import { Resolver } from './Resolver';

interface Change {
  staffId: string;
  date: string;
}

/** Marks one barber out for a day. Booked clients go through the resolver before anything saves. */
export function BarberOutPanel({ onDone, staffId }: { onDone: () => void; staffId?: string }) {
  const quick = useQuick();
  const toast = useToast();
  const staff = useApi('/api/admin/staff', staffListResponseSchema);
  const [chair, setChair] = useState(staffId ?? '');
  const [date, setDate] = useState(todayInShop());
  const send = useCallback(
    (c: Change, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/staff/${c.staffId}/day`, dayStatusResponseSchema, {
        method: 'POST',
        body: { date: c.date, status: 'out', ...(resolutions ? { resolutions } : {}) },
      }),
    [],
  );
  const action = useConflictAction(send);

  if (staff.status !== 'ready') {
    return (
      <div className="exq-panelbody">
        <Status state={staff.status === 'error' ? 'error' : 'loading'} />
      </div>
    );
  }
  const chairs = staff.data.staff.filter((s) => !s.deletedAt);
  const selected = chair || (chairs[0]?.id ?? '');
  const name = chairs.find((c) => c.id === selected)?.name ?? 'The barber';

  function finish() {
    quick.changed();
    toast({
      text: `${name} is out ${date === todayInShop() ? 'today' : shopDateLabel(date)}.`,
      tone: 'ok',
    });
    onDone();
  }

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (await action.run({ staffId: selected, date })) finish();
  }

  if (action.state.status === 'conflict') {
    return (
      <div className="exq-panelbody">
        <Resolver
          affected={action.state.affected}
          working={false}
          title={`${name} is out. ${action.state.affected.length} booked ${action.state.affected.length === 1 ? 'client needs' : 'clients need'} a decision`}
          onBack={action.reset}
          onSubmit={(r) => {
            void action.resolve(r).then((ok) => {
              if (ok) finish();
            });
          }}
        />
      </div>
    );
  }
  return (
    <form className="exq-panelbody" onSubmit={(e) => void submit(e)}>
      <Select
        label="Barber"
        value={selected}
        onChange={(e) => {
          setChair(e.target.value);
        }}
      >
        {chairs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Input
        label="Day"
        type="date"
        required
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
        }}
      />
      <p className="exq-muted">
        Nothing is cancelled until you choose what happens to each booked client.
      </p>
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
      <Button type="submit" loading={action.state.status === 'working'}>
        Mark out
      </Button>
    </form>
  );
}
