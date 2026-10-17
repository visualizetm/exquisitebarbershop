import { useCallback } from 'react';
import {
  conflictOnlyResponseSchema,
  type ConflictResolution,
  type TimeBlockView,
} from '@shared/api/admin';
import { apiRequest } from '@/lib/api';
import { shopTime } from '../format';
import { useConflictAction } from '../useConflictAction';
import { ConflictResolver } from './ConflictResolver';
import { ErrorNote } from './ErrorNote';

const KIND_LABEL: Record<TimeBlockView['kind'], string> = {
  block: 'Blocked',
  timeOff: 'Time off',
  dayOff: 'Day off',
  extraHours: 'Extra hours',
};

/** One time block with a remove button. Removing extra hours can strand bookings, so it goes through the conflict rule. */
export function TimeBlockItem({
  block,
  deletePath,
  keepOnly = false,
  onChanged,
}: {
  block: TimeBlockView;
  /** Owner: /api/admin/time-blocks/:id. Barber: /api/me/time-blocks/:id. */
  deletePath: string | null;
  keepOnly?: boolean;
  onChanged: () => void;
}) {
  const send = useCallback(
    (_request: null, resolutions?: ConflictResolution[]) =>
      apiRequest(deletePath ?? '', conflictOnlyResponseSchema, {
        method: 'DELETE',
        body: resolutions ? { resolutions } : {},
      }),
    [deletePath],
  );
  const action = useConflictAction(send);

  async function remove(resolutions?: ConflictResolution[]) {
    const ok = resolutions ? await action.resolve(resolutions) : await action.run(null);
    if (ok) onChanged();
  }

  return (
    <li className="exq-adm-block" data-state={block.kind} data-action={action.state.status}>
      <span className="exq-adm-block__kind">{KIND_LABEL[block.kind]}</span>{' '}
      <span className="exq-adm-block__time">
        {shopTime(block.startAt)} to {shopTime(block.endAt)}
      </span>
      {block.reason ? <span className="exq-adm-block__reason"> ({block.reason})</span> : null}
      {deletePath ? (
        <>
          {' '}
          <button
            type="button"
            className="exq-adm-block__remove"
            disabled={action.state.status === 'working'}
            onClick={() => void remove()}
          >
            Remove
          </button>
        </>
      ) : null}
      {action.state.status === 'conflict' ? (
        <ConflictResolver
          affected={action.state.affected}
          keepOnly={keepOnly}
          working={false}
          onSubmit={(r) => void remove(r)}
          onCancel={action.reset}
        />
      ) : null}
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
    </li>
  );
}
