import { useCallback, useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  staffListResponseSchema,
  timeBlockResponseSchema,
  type ConflictResolution,
} from '@shared/api/admin';
import { Button, Chip, Chips, Input, Select, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';
import { shopInstant, todayInShop } from '../format';
import { useConflictAction } from '../useConflictAction';
import { useQuick } from '../shell/quick';
import { Resolver } from './Resolver';

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
 * Blocks time on one chair, hiding it from booking. A block is a break; time off can span days.
 * If clients are already booked in that time nothing is saved and the resolver asks about each.
 */
export function BlockTimePanel({
  onDone,
  staffId,
  initialKind = 'block',
}: {
  onDone: () => void;
  staffId?: string;
  initialKind?: 'block' | 'timeOff';
}) {
  const quick = useQuick();
  const toast = useToast();
  const staff = useApi('/api/admin/staff', staffListResponseSchema);
  const [draft, setDraft] = useState<Draft>({
    staffId: staffId ?? '',
    kind: initialKind,
    date: todayInShop(),
    start: '12:00',
    endDate: '',
    end: '13:00',
    reason: '',
  });
  const send = useCallback((d: Draft, resolutions?: ConflictResolution[]) => {
    return apiRequest('/api/admin/time-blocks', timeBlockResponseSchema, {
      method: 'POST',
      body: {
        staffId: d.staffId,
        kind: d.kind,
        startAt: shopInstant(d.date, d.start),
        endAt: shopInstant(d.endDate || d.date, d.end),
        ...(d.reason.trim() ? { reason: d.reason.trim() } : {}),
        ...(resolutions ? { resolutions } : {}),
      },
    });
  }, []);
  const action = useConflictAction(send);

  if (staff.status !== 'ready') {
    return (
      <div className="exq-panelbody">
        <Status state={staff.status === 'error' ? 'error' : 'loading'} />
      </div>
    );
  }
  const chairs = staff.data.staff.filter((s) => !s.deletedAt);
  const current: Draft = { ...draft, staffId: draft.staffId || (chairs[0]?.id ?? '') };

  function finish(result: { kept: string[]; moved: string[]; cancelled: string[] }) {
    quick.changed();
    const extra = [
      result.moved.length > 0 ? `${result.moved.length} moved` : null,
      result.cancelled.length > 0 ? `${result.cancelled.length} cancelled` : null,
      result.kept.length > 0 ? `${result.kept.length} kept` : null,
    ].filter(Boolean);
    toast({ text: `Time blocked${extra.length > 0 ? `. ${extra.join(', ')}.` : '.'}`, tone: 'ok' });
    onDone();
  }

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    const result = await action.run(current);
    if (result) finish(result);
  }

  if (action.state.status === 'conflict') {
    return (
      <div className="exq-panelbody">
        <Resolver
          affected={action.state.affected}
          working={false}
          onBack={action.reset}
          onSubmit={(r) => {
            void action.resolve(r).then((result) => {
              if (result) finish(result);
            });
          }}
        />
      </div>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };
  return (
    <form className="exq-panelbody" onSubmit={(e) => void submit(e)}>
      <Select
        label="Barber"
        value={current.staffId}
        onChange={(e) => {
          set('staffId', e.target.value);
        }}
      >
        {chairs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Chips label="Kind">
        <Chip
          selected={draft.kind === 'block'}
          onClick={() => {
            set('kind', 'block');
          }}
        >
          Block
        </Chip>
        <Chip
          selected={draft.kind === 'timeOff'}
          onClick={() => {
            set('kind', 'timeOff');
          }}
        >
          Time off
        </Chip>
      </Chips>
      <p className="exq-muted">
        {draft.kind === 'block'
          ? 'A break, lunch or leaving early. The time disappears from booking.'
          : 'Longer time off, which can run over several days.'}
      </p>
      <Input
        label="Day"
        type="date"
        required
        value={draft.date}
        onChange={(e) => {
          set('date', e.target.value);
        }}
      />
      <div className="exq-panelbody__row">
        <Input
          label="From"
          type="time"
          step={900}
          required
          value={draft.start}
          onChange={(e) => {
            set('start', e.target.value);
          }}
        />
        <Input
          label="To"
          type="time"
          step={900}
          required
          value={draft.end}
          onChange={(e) => {
            set('end', e.target.value);
          }}
        />
      </div>
      {draft.kind === 'timeOff' ? (
        <Input
          label="Last day"
          hint="Leave empty for the same day."
          type="date"
          value={draft.endDate}
          onChange={(e) => {
            set('endDate', e.target.value);
          }}
        />
      ) : null}
      <Input
        label="Reason (optional, staff only)"
        maxLength={200}
        value={draft.reason}
        onChange={(e) => {
          set('reason', e.target.value);
        }}
      />
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
      <Button type="submit" loading={action.state.status === 'working'}>
        Block this time
      </Button>
    </form>
  );
}
