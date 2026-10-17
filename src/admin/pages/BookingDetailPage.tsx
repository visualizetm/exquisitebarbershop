import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  bookingDetailResponseSchema,
  bookingResponseSchema,
  staffListResponseSchema,
  type BookingDetailResponse,
} from '@shared/api/admin';
import type { BookingStatus } from '@shared/schemas/booking';
import { Status } from '@/components/Status';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorNote } from '../components/ErrorNote';
import {
  SOURCE_LABEL,
  STATUS_LABEL,
  TRANSITION_LABEL,
  money,
  phoneLabel,
  shopDateTime,
  shopInstant,
  shopParts,
} from '../format';

/**
 * One booking with every action the caller may take. `mine` is the barber
 * view: their own chair only, complete or no show with undo, nothing else.
 */
export function BookingDetailPage({ mine = false }: { mine?: boolean }) {
  usePageTitle('Booking');
  const { id = '' } = useParams();
  const base = mine ? '/api/me/bookings' : '/api/admin/bookings';
  const [version, setVersion] = useState(0);
  const loaded = useApi(`${base}/${id}`, bookingDetailResponseSchema, { version });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [lastChange, setLastChange] = useState<{ from: BookingStatus; to: BookingStatus } | null>(
    null,
  );

  if (loaded.status !== 'ready') {
    const notFound = loaded.error instanceof ApiRequestError && loaded.error.status === 404;
    return (
      <article className="exq-adm-booking" data-state={notFound ? 'not-found' : loaded.status}>
        <h1 className="exq-adm-booking__title">Booking</h1>
        <Status
          state={loaded.status === 'loading' ? 'loading' : 'error'}
          message={notFound ? 'That booking was not found.' : undefined}
        />
      </article>
    );
  }
  const detail = loaded.data;
  const b = detail.booking;

  async function act(work: () => Promise<unknown>) {
    setWorking(true);
    setError(null);
    try {
      await work();
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  function changeStatus(to: BookingStatus, notify = false) {
    const from = b.status;
    void act(async () => {
      await apiRequest(`${base}/${b.id}/status`, bookingResponseSchema, {
        method: 'POST',
        body: { status: to, notify },
      });
      setLastChange({ from, to });
    });
  }

  const simpleTransitions = detail.transitions.filter(
    (t) => t !== 'cancelled' && !(t === 'confirmed' && b.status === 'cancelled'),
  );
  const canUndo =
    lastChange !== null &&
    lastChange.to === b.status &&
    detail.transitions.includes(lastChange.from);

  return (
    <article
      className="exq-adm-booking"
      data-state={b.status}
      data-new={b.isNew ? 'true' : 'false'}
      data-working={working ? 'true' : 'false'}
    >
      <p className="exq-adm-booking__back">
        <Link to={mine ? '/admin/me' : '/admin/schedule'}>Back to the schedule</Link>
      </p>
      <h1 className="exq-adm-booking__title">
        {b.customer.name}, {shopDateTime(b.startAt)}
      </h1>
      <dl className="exq-adm-booking__facts">
        <dt>Status</dt>
        <dd className="exq-adm-booking__status" data-state={b.status}>
          {STATUS_LABEL[b.status]}
        </dd>
        <dt>Reference</dt>
        <dd>{b.referenceCode}</dd>
        <dt>Chair</dt>
        <dd>
          {b.staff.name}
          {b.staffRequested ? '' : ' (first available)'}
        </dd>
        <dt>Services</dt>
        <dd>{b.services.map((s) => s.name).join(', ')}</dd>
        <dt>Time</dt>
        <dd>
          {shopDateTime(b.startAt)}, {b.durationMinutes} minutes
        </dd>
        <dt>Total</dt>
        <dd>{money(b.totalPriceCents)}</dd>
        <dt>Phone</dt>
        <dd>
          <a href={`tel:${b.customer.phone}`}>{phoneLabel(b.customer.phone)}</a>
        </dd>
        <dt>Email</dt>
        <dd>{b.customer.email ?? 'None given'}</dd>
        <dt>Source</dt>
        <dd>{SOURCE_LABEL[b.source]}</dd>
        {b.notes ? (
          <>
            <dt>Notes</dt>
            <dd>{b.notes}</dd>
          </>
        ) : null}
        {b.cancellation ? (
          <>
            <dt>Cancelled</dt>
            <dd>
              {shopDateTime(b.cancellation.at)} by {b.cancellation.by}
              {b.cancellation.reason ? `: ${b.cancellation.reason}` : ''}
            </dd>
          </>
        ) : null}
      </dl>

      <section className="exq-adm-booking__actions" aria-labelledby="exq-adm-booking-actions">
        <h2 id="exq-adm-booking-actions">Actions</h2>
        {canUndo ? (
          <p className="exq-adm-booking__undo" data-state="available">
            Marked {STATUS_LABEL[b.status].toLowerCase()}.{' '}
            <button
              type="button"
              disabled={working}
              onClick={() => {
                changeStatus(lastChange.from);
              }}
            >
              Undo
            </button>
          </p>
        ) : null}
        <p className="exq-adm-booking__transitions">
          {simpleTransitions.map((t) => (
            <button
              key={t}
              type="button"
              className="exq-adm-booking__transition"
              data-state={t}
              disabled={working}
              onClick={() => {
                changeStatus(t);
              }}
            >
              {TRANSITION_LABEL[t]}
            </button>
          ))}
        </p>
        {!mine && b.status === 'cancelled' && detail.transitions.includes('confirmed') ? (
          <RestoreForm
            working={working}
            hasEmail={b.customer.email !== null}
            onRestore={(n) => {
              changeStatus('confirmed', n);
            }}
          />
        ) : null}
        {!mine && detail.transitions.includes('cancelled') ? (
          <CancelForm
            working={working}
            hasEmail={b.customer.email !== null}
            onCancel={(input) => {
              const from = b.status;
              void act(async () => {
                await apiRequest(`${base}/${b.id}/cancel`, bookingResponseSchema, {
                  method: 'POST',
                  body: input,
                });
                setLastChange({ from, to: 'cancelled' });
              });
            }}
          />
        ) : null}
        <ErrorNote error={error} />
      </section>

      {!mine && b.status === 'confirmed' ? (
        <RescheduleForm
          detail={detail}
          working={working}
          onSubmit={(body) => {
            void act(() =>
              apiRequest(`${base}/${b.id}/reschedule`, bookingResponseSchema, {
                method: 'POST',
                body,
              }),
            );
          }}
        />
      ) : null}

      {!mine ? (
        <NotesForm
          key={b.notes ?? ''}
          notes={b.notes}
          working={working}
          onSave={(notes) => {
            void act(() =>
              apiRequest(`${base}/${b.id}`, bookingResponseSchema, {
                method: 'PATCH',
                body: { notes },
              }),
            );
          }}
        />
      ) : null}

      {!mine ? <History detail={detail} /> : null}
    </article>
  );
}

function RestoreForm({
  working,
  hasEmail,
  onRestore,
}: {
  working: boolean;
  hasEmail: boolean;
  onRestore: (notify: boolean) => void;
}) {
  const [notify, setNotify] = useState(hasEmail);
  return (
    <form
      className="exq-adm-booking__restore"
      onSubmit={(e) => {
        e.preventDefault();
        onRestore(notify);
      }}
    >
      <label>
        <input
          type="checkbox"
          checked={notify}
          disabled={!hasEmail}
          onChange={(e) => {
            setNotify(e.target.checked);
          }}
        />{' '}
        Email the customer a new confirmation
      </label>{' '}
      <button type="submit" disabled={working}>
        Restore booking
      </button>
    </form>
  );
}

function CancelForm({
  working,
  hasEmail,
  onCancel,
}: {
  working: boolean;
  hasEmail: boolean;
  onCancel: (input: { notify: boolean; reason?: string }) => void;
}) {
  const [notify, setNotify] = useState(hasEmail);
  const [reason, setReason] = useState('');
  return (
    <form
      className="exq-adm-booking__cancel"
      onSubmit={(e: SyntheticEvent) => {
        e.preventDefault();
        onCancel(reason.trim() ? { notify, reason: reason.trim() } : { notify });
      }}
    >
      <h3>Cancel this booking</h3>
      <p>
        <label htmlFor="exq-adm-cancel-reason">Reason (optional)</label>{' '}
        <input
          id="exq-adm-cancel-reason"
          value={reason}
          maxLength={500}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={notify}
            disabled={!hasEmail}
            onChange={(e) => {
              setNotify(e.target.checked);
            }}
          />{' '}
          Email the customer
        </label>
      </p>
      <button type="submit" className="exq-adm-booking__cancel-submit" disabled={working}>
        Cancel booking
      </button>
    </form>
  );
}

function RescheduleForm({
  detail,
  working,
  onSubmit,
}: {
  detail: BookingDetailResponse;
  working: boolean;
  onSubmit: (body: { startAt: string; staff?: string; notify: boolean; override: boolean }) => void;
}) {
  const b = detail.booking;
  const parts = shopParts(b.startAt);
  const staff = useApi('/api/admin/staff', staffListResponseSchema);
  const [date, setDate] = useState(parts.date);
  const [time, setTime] = useState(parts.time);
  const [chair, setChair] = useState(b.staff.slug);
  const [notify, setNotify] = useState(b.customer.email !== null);
  const [override, setOverride] = useState(false);
  return (
    <form
      className="exq-adm-booking__reschedule"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          startAt: shopInstant(date, time),
          ...(chair !== b.staff.slug ? { staff: chair } : {}),
          notify,
          override,
        });
      }}
    >
      <h2>Reschedule</h2>
      <p>
        <label htmlFor="exq-adm-resched-date">Day</label>{' '}
        <input
          id="exq-adm-resched-date"
          type="date"
          required
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
          }}
        />{' '}
        <label htmlFor="exq-adm-resched-time">Time</label>{' '}
        <input
          id="exq-adm-resched-time"
          type="time"
          step={900}
          required
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
          }}
        />
      </p>
      <p>
        <label htmlFor="exq-adm-resched-chair">Chair</label>{' '}
        <select
          id="exq-adm-resched-chair"
          value={chair}
          onChange={(e) => {
            setChair(e.target.value);
          }}
        >
          {staff.status === 'ready'
            ? staff.data.staff
                .filter((s) => !s.deletedAt)
                .map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.name}
                  </option>
                ))
            : [
                <option key={b.staff.id} value={b.staff.slug}>
                  {b.staff.name}
                </option>,
              ]}
        </select>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={notify}
            disabled={b.customer.email === null}
            onChange={(e) => {
              setNotify(e.target.checked);
            }}
          />{' '}
          Email the customer the new time
        </label>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => {
              setOverride(e.target.checked);
            }}
          />{' '}
          Allow inside the lead time or past the booking window (recorded in the audit log)
        </label>
      </p>
      <button type="submit" disabled={working}>
        Move booking
      </button>
    </form>
  );
}

function NotesForm({
  notes,
  working,
  onSave,
}: {
  notes: string | null;
  working: boolean;
  onSave: (notes: string | null) => void;
}) {
  const [value, setValue] = useState(notes ?? '');
  return (
    <form
      className="exq-adm-booking__notes"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value.trim() ? value.trim() : null);
      }}
    >
      <h2>
        <label htmlFor="exq-adm-booking-notes">Notes</label>
      </h2>
      <textarea
        id="exq-adm-booking-notes"
        maxLength={500}
        rows={3}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
      />
      <p>
        <button type="submit" disabled={working}>
          Save notes
        </button>
      </p>
    </form>
  );
}

function History({ detail }: { detail: BookingDetailResponse }) {
  return (
    <section className="exq-adm-booking__history" aria-labelledby="exq-adm-booking-history">
      <h2 id="exq-adm-booking-history">History</h2>
      <ol className="exq-adm-booking__audit">
        {detail.audit.map((a) => (
          <li key={a.id} data-state={a.action}>
            {shopDateTime(a.at)}: {a.action} by {a.actor.type}
          </li>
        ))}
      </ol>
      <h3>Emails</h3>
      {detail.outbox.length === 0 ? <p>No emails for this booking.</p> : null}
      <ul className="exq-adm-booking__emails">
        {detail.outbox.map((m) => (
          <li key={m.id} data-state={m.status}>
            {m.template} to {m.to}: {m.status}
          </li>
        ))}
      </ul>
    </section>
  );
}
