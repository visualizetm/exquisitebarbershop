import { useState } from 'react';
import { DateTime } from 'luxon';
import Trash01 from '@untitled-ui/icons-react/build/esm/Trash01';
import {
  conflictOnlyResponseSchema,
  timeBlockListResponseSchema,
  type AdminStaffView,
  type TimeBlockView,
} from '@shared/api/admin';
import { SHOP_TIMEZONE } from '@shared/lib/constants';
import { Button, EmptyState, IconButton, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';
import { shopDateTime, todayInShop } from '../format';
import { useQuick } from '../shell/quick';

/** Upcoming time off for one barber: a list, and an Add button that opens the same panel as Block time. */
export function TimeOffTab({ member }: { member: AdminStaffView }) {
  const quick = useQuick();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const from = todayInShop();
  const to =
    DateTime.fromISO(from, { zone: SHOP_TIMEZONE }).plus({ days: 365 }).toISODate() ?? from;
  const list = useApi(
    `/api/admin/time-blocks?from=${from}&to=${to}&staffId=${member.id}`,
    timeBlockListResponseSchema,
    { version: version + quick.version },
  );
  const [error, setError] = useState<unknown>(null);

  async function remove(block: TimeBlockView) {
    setError(null);
    try {
      await apiRequest(`/api/admin/time-blocks/${block.id}`, conflictOnlyResponseSchema, {
        method: 'DELETE',
        body: {},
      });
      setVersion((v) => v + 1);
      toast({ text: 'Time off removed.', tone: 'ok' });
    } catch (err) {
      setError(err);
    }
  }

  if (list.status !== 'ready')
    return <Status state={list.status === 'error' ? 'error' : 'loading'} />;
  const rows = list.data.timeBlocks.filter((b) => b.kind === 'timeOff' || b.kind === 'dayOff');
  return (
    <div className="exq-tabbody">
      <div>
        <Button
          size="sm"
          onClick={() => {
            quick.openBlock({ staffId: member.id, kind: 'timeOff' });
          }}
        >
          Add time off
        </Button>
      </div>
      <ErrorNote error={error} />
      {rows.length === 0 ? (
        <EmptyState title="No time off coming up">
          {member.name} is in on every working day.
        </EmptyState>
      ) : (
        <div className="exq-table-wrap">
          <table className="exq-table">
            <caption className="exq-visually-hidden">Time off for {member.name}</caption>
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Reason</th>
                <th scope="col" data-align="end">
                  <span className="exq-visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{shopDateTime(b.startAt)}</td>
                  <td>{shopDateTime(b.endAt)}</td>
                  <td>{b.reason ?? (b.kind === 'dayOff' ? 'Out for the day' : '')}</td>
                  <td data-align="end">
                    <IconButton
                      label={`Remove time off from ${shopDateTime(b.startAt)}`}
                      icon={<Trash01 aria-hidden="true" />}
                      onClick={() => void remove(b)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
