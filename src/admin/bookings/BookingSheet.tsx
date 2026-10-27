import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import AlertCircle from '@untitled-ui/icons-react/build/esm/AlertCircle';
import Calendar from '@untitled-ui/icons-react/build/esm/Calendar';
import SwitchHorizontal01 from '@untitled-ui/icons-react/build/esm/SwitchHorizontal01';
import Check from '@untitled-ui/icons-react/build/esm/Check';
import Link01 from '@untitled-ui/icons-react/build/esm/Link01';
import Mail01 from '@untitled-ui/icons-react/build/esm/Mail01';
import XCircle from '@untitled-ui/icons-react/build/esm/XCircle';
import { bookingDetailResponseSchema, bookingResponseSchema } from '@shared/api/admin';
import { okResponseSchema } from '@shared/api/auth';
import type { BookingStatus } from '@shared/schemas/booking';
import { Button, Chip, Chips, Input, StatusChip, Textarea, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../components/ErrorNote';
import { SOURCE_LABEL, money, phoneLabel, shopDateTime } from '../format';
import { discountTag } from '@shared/lib/launchOffer';
import { useQuick } from '../shell/quick';
import { useMe } from '../useSession';

type Panel = null | 'cancel';

const ACTION_WORDS: Record<string, string> = {
  'booking.create': 'Booked',
  'booking.status': 'Status changed',
  'booking.arrived': 'Arrived at the shop',
  'booking.start': 'Started',
  'booking.cancel': 'Cancelled',
  'booking.restore': 'Restored',
  'booking.reschedule': 'Moved to another time',
  'booking.move': 'Moved to another barber',
  'booking.notes': 'Notes changed',
  'booking.resend': 'Confirmation sent again',
  'booking.keepException': 'Kept as an exception',
};
const ACTOR_WORDS: Record<string, string> = {
  owner: 'the owner',
  barber: 'a barber',
  customer: 'the client',
  system: 'the system',
};

/**
 * One booking in a side panel: who, when, what, the actions the owner needs (Reschedule, Cancel,
 * Mark done, No show with Undo, Resend, Copy manage link), notes and its history. Every action
 * says what happened in a toast and refreshes the lists behind it.
 */
export function BookingSheet({ id }: { id: string }) {
  const quick = useQuick();
  const toast = useToast();
  const me = useMe();
  const [version, setVersion] = useState(0);
  const loaded = useApi(`/api/admin/bookings/${id}`, bookingDetailResponseSchema, { version });
  const [panel, setPanel] = useState<Panel>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (loaded.status !== 'ready') {
    const notFound = loaded.error instanceof ApiRequestError && loaded.error.status === 404;
    return (
      <div className="exq-panelbody" data-state={notFound ? 'not-found' : loaded.status}>
        {loaded.status === 'loading' ? (
          <div aria-busy="true" role="status">
            <p className="exq-skeleton exq-bsheet__skeleton">Loading the booking</p>
          </div>
        ) : (
          <Status state="error" message={notFound ? 'That booking was not found.' : undefined} />
        )}
      </div>
    );
  }
  const detail = loaded.data;
  const b = detail.booking;

  async function run<T>(
    name: string,
    work: () => Promise<T>,
    message: (r: T) => string,
    undo?: () => void,
  ) {
    setWorking(name);
    setError(null);
    try {
      const result = await work();
      setVersion((v) => v + 1);
      quick.changed();
      setPanel(null);
      toast({
        text: message(result),
        tone: 'ok',
        ...(undo ? { action: { label: 'Undo', onClick: undo } } : {}),
      });
    } catch (err) {
      setError(err);
    } finally {
      setWorking(null);
    }
  }

  function setStatus(to: BookingStatus, label: string, from?: BookingStatus) {
    void run(
      `status-${to}`,
      () =>
        apiRequest(`/api/admin/bookings/${b.id}/status`, bookingResponseSchema, {
          method: 'POST',
          body: { status: to, notify: false },
        }),
      () => `${b.customer.name}: ${label}.`,
      from
        ? () => {
            setStatus(from, 'back to confirmed');
          }
        : undefined,
    );
  }

  async function copyLink() {
    if (!detail.managePath) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${detail.managePath}`);
      toast({ text: 'Manage link copied.', tone: 'ok' });
    } catch {
      toast({
        text: 'The browser would not copy. Open Resend confirmation instead.',
        tone: 'danger',
      });
    }
  }

  const can = (s: BookingStatus) => detail.transitions.includes(s);
  const emailOff = !me.features.email;
  const noEmail = b.customer.email === null;
  const resendBlocked = emailOff || noEmail || b.status !== 'confirmed';
  const resendReason = emailOff
    ? 'Email is off on this site, so nothing can be sent.'
    : noEmail
      ? 'This booking has no email address.'
      : 'Only a confirmed booking can be confirmed again.';

  return (
    <div className="exq-bsheet" data-state={b.status} data-working={working ? 'true' : 'false'}>
      <h3 className="exq-bsheet__name">{b.customer.name}</h3>
      <p className="exq-bsheet__head">
        <StatusChip status={b.status} />
        <span className="exq-bsheet__code">{b.referenceCode}</span>
        {b.isNew ? (
          <span className="exq-status-chip" data-tone="accent">
            New
          </span>
        ) : null}
      </p>

      <dl className="exq-bsheet__facts">
        <Fact term="When">
          {shopDateTime(b.startAt)}, {b.durationMinutes} minutes
        </Fact>
        <Fact term="Barber">
          {b.staff.name}
          {b.staffRequested ? '' : ' (first available)'}
        </Fact>
        <Fact term="Services">{b.services.map((s) => s.name).join(', ')}</Fact>
        <Fact term="Total">
          {money(b.totalPriceCents)}
          {discountTag(b.discounts) ? `, ${discountTag(b.discounts) ?? ''}` : ''}
        </Fact>
        <Fact term="Phone">
          <a href={`tel:${b.customer.phone}`}>{phoneLabel(b.customer.phone)}</a>
        </Fact>
        <Fact term="Email">{b.customer.email ?? 'None given'}</Fact>
        <Fact term="Source">{SOURCE_LABEL[b.source] ?? b.source}</Fact>
        {b.cancellation ? (
          <Fact term="Cancelled">
            {shopDateTime(b.cancellation.at)} by{' '}
            {ACTOR_WORDS[b.cancellation.by] ?? b.cancellation.by}
            {b.cancellation.reason ? `: ${b.cancellation.reason}` : ''}
          </Fact>
        ) : null}
      </dl>

      <div className="exq-bsheet__actions" role="group" aria-label="Actions">
        {b.status === 'confirmed' ? (
          <>
            <Button
              size="sm"
              variant="outline"
              icon={<Calendar aria-hidden="true" />}
              onClick={() => {
                quick.openNewBooking({ reschedule: b });
              }}
            >
              Reschedule
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<SwitchHorizontal01 aria-hidden="true" />}
              onClick={() => {
                quick.openNewBooking({ move: b });
              }}
            >
              Move to another barber
            </Button>
          </>
        ) : null}
        {can('cancelled') ? (
          <Button
            size="sm"
            variant="outline"
            icon={<XCircle aria-hidden="true" />}
            onClick={() => {
              setPanel(panel === 'cancel' ? null : 'cancel');
            }}
          >
            Cancel
          </Button>
        ) : null}
        {can('completed') ? (
          <Button
            size="sm"
            icon={<Check aria-hidden="true" />}
            loading={working === 'status-completed'}
            onClick={() => {
              setStatus('completed', 'marked done', 'confirmed');
            }}
          >
            Mark done
          </Button>
        ) : null}
        {can('noShow') ? (
          <Button
            size="sm"
            variant="outline"
            icon={<AlertCircle aria-hidden="true" />}
            loading={working === 'status-noShow'}
            onClick={() => {
              setStatus('noShow', 'marked no show', 'confirmed');
            }}
          >
            No show
          </Button>
        ) : null}
        {b.status !== 'confirmed' && b.status !== 'cancelled' && can('confirmed') ? (
          <Button
            size="sm"
            variant="ghost"
            loading={working === 'status-confirmed'}
            onClick={() => {
              setStatus('confirmed', 'back to confirmed');
            }}
          >
            Undo
          </Button>
        ) : null}
        <span className="exq-bsheet__tip" data-tip={resendBlocked ? resendReason : undefined}>
          <Button
            size="sm"
            variant="outline"
            icon={<Mail01 aria-hidden="true" />}
            aria-disabled={resendBlocked}
            aria-describedby={resendBlocked ? 'exq-resend-why' : undefined}
            loading={working === 'resend'}
            onClick={() => {
              if (resendBlocked) return;
              void run(
                'resend',
                () =>
                  apiRequest(`/api/admin/bookings/${b.id}/resend`, okResponseSchema, {
                    method: 'POST',
                    body: {},
                  }),
                () => `Confirmation sent to ${b.customer.email ?? 'the client'}.`,
              );
            }}
          >
            Resend confirmation
          </Button>
          {resendBlocked ? (
            <span id="exq-resend-why" className="exq-visually-hidden">
              {resendReason}
            </span>
          ) : null}
        </span>
        <Button
          size="sm"
          variant="outline"
          icon={<Link01 aria-hidden="true" />}
          disabled={!detail.managePath}
          onClick={() => void copyLink()}
        >
          Copy manage link
        </Button>
      </div>
      {resendBlocked ? <p className="exq-muted exq-bsheet__why">{resendReason}</p> : null}
      <ErrorNote error={error} />

      {panel === 'cancel' ? (
        <CancelForm
          hasEmail={!noEmail}
          working={working === 'cancel'}
          onSubmit={(input) => {
            void run(
              'cancel',
              () =>
                apiRequest(`/api/admin/bookings/${b.id}/cancel`, bookingResponseSchema, {
                  method: 'POST',
                  body: input,
                }),
              () => (input.notify ? 'Cancelled. The client was emailed.' : 'Cancelled.'),
            );
          }}
        />
      ) : null}

      <NotesForm
        key={b.notes ?? ''}
        notes={b.notes}
        working={working === 'notes'}
        onSave={(notes) => {
          void run(
            'notes',
            () =>
              apiRequest(`/api/admin/bookings/${b.id}`, bookingResponseSchema, {
                method: 'PATCH',
                body: { notes },
              }),
            () => 'Notes saved.',
          );
        }}
      />

      <section aria-labelledby="exq-bsheet-history">
        <h3 id="exq-bsheet-history" className="exq-bsheet__h">
          History
        </h3>
        <ol className="exq-bsheet__history exq-bare">
          {detail.audit.map((a) => (
            <li key={a.id}>
              <span className="exq-bsheet__when">{shopDateTime(a.at)}</span>
              {ACTION_WORDS[a.action] ?? a.action}, by {ACTOR_WORDS[a.actor.type] ?? a.actor.type}
            </li>
          ))}
        </ol>
        {detail.outbox.length > 0 ? (
          <>
            <h3 className="exq-bsheet__h">Emails</h3>
            <ul className="exq-bsheet__history exq-bare">
              {detail.outbox.map((m) => (
                <li key={m.id}>
                  {m.template} to {m.to}: {m.status}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="exq-bsheet__fact">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CancelForm({
  hasEmail,
  working,
  onSubmit,
}: {
  hasEmail: boolean;
  working: boolean;
  onSubmit: (input: { notify: boolean; reason?: string }) => void;
}) {
  const [notify, setNotify] = useState(hasEmail);
  const [reason, setReason] = useState('');
  return (
    <form
      className="exq-bsheet__panel"
      onSubmit={(e: SyntheticEvent) => {
        e.preventDefault();
        onSubmit(reason.trim() ? { notify, reason: reason.trim() } : { notify });
      }}
    >
      <h3 className="exq-bsheet__h">Cancel this booking</h3>
      <Chips label="Who is told">
        <Chip
          selected={!notify}
          onClick={() => {
            setNotify(false);
          }}
        >
          Cancel
        </Chip>
        <Chip
          selected={notify}
          disabled={!hasEmail}
          onClick={() => {
            setNotify(true);
          }}
        >
          Cancel and notify
        </Chip>
      </Chips>
      {!hasEmail ? (
        <p className="exq-muted">No email on file, so the client cannot be notified.</p>
      ) : null}
      <Input
        label="Reason (optional)"
        maxLength={500}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
        }}
      />
      <Button type="submit" variant="accent" loading={working}>
        {notify ? 'Cancel and notify' : 'Cancel booking'}
      </Button>
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
      className="exq-bsheet__panel"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value.trim() ? value.trim() : null);
      }}
    >
      <Textarea
        label="Notes"
        maxLength={500}
        rows={3}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
      />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        loading={working}
        disabled={value.trim() === (notes ?? '')}
      >
        Save notes
      </Button>
    </form>
  );
}
