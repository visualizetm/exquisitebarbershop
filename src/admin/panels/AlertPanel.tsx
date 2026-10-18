import { useCallback, useEffect, useRef, useState } from 'react';
import {
  conflictOnlyResponseSchema,
  overviewResponseSchema,
  type AlertView,
  type ConflictResolution,
} from '@shared/api/admin';
import { okResponseSchema } from '@shared/api/auth';
import { Button, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { ErrorNote } from '../components/ErrorNote';
import { shopDateLabel } from '../format';
import { useConflictAction } from '../useConflictAction';
import { useQuick } from '../shell/quick';
import { Resolver } from './Resolver';

/**
 * Where the owner decides on an alert: a barber who is out (the bookings are still in place) or a
 * request for days off. The server answers the first request with the list of affected bookings
 * and the chairs each could move to; the resolver collects one choice for every booking.
 */
export function AlertPanel({ id, onDone }: { id: string; onDone: () => void }) {
  const quick = useQuick();
  const toast = useToast();
  const [alert, setAlert] = useState<AlertView | null | 'missing'>(null);
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);

  const send = useCallback(
    (_request: null, resolutions?: ConflictResolution[]) =>
      apiRequest(`/api/admin/alerts/${id}/resolve`, conflictOnlyResponseSchema, {
        method: 'POST',
        body: resolutions ? { resolutions } : {},
      }),
    [id],
  );
  const action = useConflictAction(send);

  function finish(message: string) {
    quick.changed();
    toast({ text: message, tone: 'ok' });
    onDone();
  }

  // Load the alert (for the heading), then ask the server which bookings need a decision.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    apiRequest('/api/admin/overview', overviewResponseSchema, { fresh: true })
      .then((o) => {
        const found = o.alerts.find((a) => a.id === id) ?? null;
        if (!found) {
          setAlert('missing');
          return;
        }
        setAlert(found);
        void action.run(null).then((r) => {
          if (r) finish('Done. Nothing needed a decision.');
        });
      })
      .catch((err: unknown) => {
        setError(err);
      });
  }, [id]);

  async function dismiss() {
    try {
      await apiRequest(`/api/admin/alerts/${id}/dismiss`, okResponseSchema, {
        method: 'POST',
        body: {},
      });
      finish(
        alert !== null && alert !== 'missing' && alert.kind === 'timeOffRequest'
          ? 'Request declined.'
          : 'Alert closed.',
      );
    } catch (err) {
      setError(err);
    }
  }

  if (alert === 'missing') {
    return (
      <div className="exq-panelbody">
        <p>That alert has already been dealt with.</p>
        <Button onClick={onDone}>Close</Button>
      </div>
    );
  }
  if (!alert)
    return (
      <div className="exq-panelbody">
        {error ? <ErrorNote error={error} /> : <Status state="loading" />}
      </div>
    );

  const request = alert.kind === 'timeOffRequest';
  const when =
    alert.fromDate === alert.toDate
      ? shopDateLabel(alert.fromDate)
      : `${shopDateLabel(alert.fromDate)} to ${shopDateLabel(alert.toDate)}`;
  return (
    <div className="exq-panelbody">
      <p>
        <strong>{alert.staffName}</strong>
        {request ? ` asked for ${when} off.` : ` is out ${when}.`}
        {alert.reason ? ` Reason: ${alert.reason}.` : ''}
      </p>
      {action.state.status === 'conflict' ? (
        <Resolver
          affected={action.state.affected}
          working={false}
          title={`${action.state.affected.length} booked ${action.state.affected.length === 1 ? 'client needs' : 'clients need'} a decision`}
          intro={
            request
              ? 'Nothing is approved yet. Choose for each booking, then approve the time off.'
              : `${alert.staffName} is out. Their bookings are still in place until you decide.`
          }
          applyLabel={request ? 'Approve the time off' : 'Save decisions'}
          onBack={onDone}
          onSubmit={(r) => {
            void action.resolve(r).then((ok) => {
              if (ok) finish(request ? 'Time off approved.' : 'Decisions saved.');
            });
          }}
        />
      ) : null}
      {action.state.status === 'working' ? <Status state="loading" /> : null}
      {action.state.status === 'error' ? <ErrorNote error={action.state.error} /> : null}
      <ErrorNote error={error} />
      {request ? (
        <Button variant="outline" onClick={() => void dismiss()}>
          Decline the request
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => void dismiss()}>
          Dismiss without changing anything
        </Button>
      )}
    </div>
  );
}
