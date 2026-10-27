import { useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import Phone from '@untitled-ui/icons-react/build/esm/Phone';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import UserPlus01 from '@untitled-ui/icons-react/build/esm/UserPlus01';
import { publicShopSchema } from '@shared/api/public';
import {
  teamDayResponseSchema,
  teamStatusResponseSchema,
  type TeamBookingView,
  type TeamDayResponse,
} from '@shared/api/team';
import {
  Button,
  ButtonAnchor,
  ButtonLink,
  EmptyState,
  ErrorState,
  Sheet,
  StatusChip,
  Textarea,
  useToast,
} from '@/components/ui';
import { NewBookingFlow, type FlowIntent } from '@/booking-flow/NewBookingFlow';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { shopDateLabel, shopTime } from '@/admin/format';
import { TeamError } from './TeamError';
import { useTeamAction, useTeamApi, useTeamMe } from './useTeamSession';

/**
 * The barber's day: the next client as a big card with Done and No show, then the whole day.
 * Tapping any row opens the same actions. A client's phone number is never shown; the shop's
 * is one tap away instead.
 */
export function TodayPage() {
  usePageTitle('Today');
  const act = useTeamAction();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const day = useTeamApi('/api/team/today', teamDayResponseSchema, version);
  const shop = useApi('/api/shop', publicShopSchema);
  const last = useRef<TeamDayResponse | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowIntent | null>(null);
  const me = useTeamMe();
  const [busy, setBusy] = useState<string | null>(null);

  if (day.status === 'ready') last.current = day.data;
  const data = day.status === 'ready' ? day.data : last.current;
  const phone = shop.status === 'ready' ? shop.data.phone : null;
  const reload = () => {
    setVersion((v) => v + 1);
  };

  async function setStatus(booking: TeamBookingView, status: 'completed' | 'noShow' | 'confirmed') {
    setBusy(booking.id);
    try {
      await act(`/api/team/bookings/${booking.id}/status`, teamStatusResponseSchema, {
        body: { status },
      });
      reload();
      toast(
        status === 'confirmed'
          ? { text: `${booking.customerName} is back on the schedule.`, tone: 'ok' }
          : {
              text:
                status === 'completed'
                  ? `${booking.customerName} is done.`
                  : `${booking.customerName} marked no show.`,
              tone: 'ok',
              action: {
                label: 'Undo',
                onClick: () => {
                  void setStatus(booking, 'confirmed');
                },
              },
            },
      );
    } catch {
      toast({ text: 'That did not save. Try again.', tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return day.status === 'error' ? (
      <ErrorState title="Today did not load">Check the connection and try again.</ErrorState>
    ) : (
      <Status state="loading" />
    );
  }

  const open = data.bookings.find((b) => b.id === openId) ?? null;
  return (
    <div className="exq-team-page" data-state={day.status === 'ready' ? 'ready' : 'refreshing'}>
      <header className="exq-team-head">
        <div>
          <h1>Today</h1>
          <p className="exq-muted">
            {shopDateLabel(data.date)}
            {data.counts.total > 0
              ? `, ${String(data.counts.left)} left of ${String(data.counts.total)}`
              : ''}
          </p>
        </div>
        <div className="exq-team-head__actions">
          <Button
            size="lg"
            icon={<UserPlus01 aria-hidden="true" />}
            onClick={() => {
              setFlow({ kind: 'new', now: true });
            }}
          >
            Walk-in
          </Button>
          <Button
            size="lg"
            variant="outline"
            icon={<Plus aria-hidden="true" />}
            onClick={() => {
              setFlow({ kind: 'new' });
            }}
          >
            Add booking
          </Button>
          <ButtonLink to="/team/checkin" size="lg" variant="ghost">
            Check in
          </ButtonLink>
        </div>
      </header>

      {data.isOut ? (
        <p className="exq-team-note" role="status">
          You are marked out today. The owner has your clients.
        </p>
      ) : null}

      {data.nextUp ? (
        <section className="exq-team-next" aria-labelledby="exq-team-next-title">
          <h2 id="exq-team-next-title" className="exq-team-next__label">
            Next up
          </h2>
          <p className="exq-team-next__time">
            {shopTime(data.nextUp.startAt)} to {shopTime(data.nextUp.endAt)}
          </p>
          <p className="exq-team-next__who">{data.nextUp.customerName}</p>
          <p className="exq-muted">{data.nextUp.services.join(', ')}</p>
          {data.nextUp.notes ? <p className="exq-team-next__notes">{data.nextUp.notes}</p> : null}
          <div className="exq-team-next__actions">
            <Button
              size="lg"
              loading={busy === data.nextUp.id}
              onClick={() => {
                if (data.nextUp) void setStatus(data.nextUp, 'completed');
              }}
            >
              Done
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={busy === data.nextUp.id}
              onClick={() => {
                if (data.nextUp) void setStatus(data.nextUp, 'noShow');
              }}
            >
              No show
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setOpenId(data.nextUp?.id ?? null);
            }}
          >
            Add note
          </Button>
        </section>
      ) : data.counts.total === 0 && !data.isOut ? (
        <EmptyState title="No clients booked today">
          {data.working.ranges.length === 0
            ? 'You are not scheduled today.'
            : 'Walk-ins are welcome. Tap Walk-in when someone sits down.'}
        </EmptyState>
      ) : data.counts.total > 0 ? (
        <p className="exq-team-note" role="status">
          That is everyone for today.
        </p>
      ) : null}

      {data.bookings.length > 0 ? (
        <section aria-labelledby="exq-team-list-title">
          <h2 id="exq-team-list-title" className="exq-team-sub">
            The day
          </h2>
          <ul className="exq-team-list exq-bare">
            {data.bookings.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="exq-team-row"
                  data-state={b.status}
                  onClick={() => {
                    setOpenId(b.id);
                  }}
                >
                  <span className="exq-team-row__time">{shopTime(b.startAt)}</span>
                  <span className="exq-team-row__body">
                    <strong>{b.customerName}</strong>
                    <span>{b.services.join(', ')}</span>
                  </span>
                  <StatusChip status={b.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.blocks.length > 0 ? (
        <p className="exq-muted">
          Blocked today:{' '}
          {data.blocks.map((b) => `${shopTime(b.startAt)} to ${shopTime(b.endAt)}`).join(', ')}
        </p>
      ) : null}

      <Sheet
        open={open !== null}
        title={open ? open.customerName : 'Booking'}
        onClose={() => {
          setOpenId(null);
        }}
      >
        {open ? (
          <BookingActions
            booking={open}
            phone={phone}
            busy={busy === open.id}
            onStatus={(status) => {
              void setStatus(open, status);
            }}
            onSaved={() => {
              reload();
              toast({ text: 'Note saved.', tone: 'ok' });
            }}
          />
        ) : null}
      </Sheet>

      <NewBookingFlow
        open={flow !== null}
        session="team"
        ownChair={{ id: me.staff.id, name: me.staff.name }}
        intent={flow ?? { kind: 'new' }}
        onClose={() => {
          setFlow(null);
        }}
        onDone={(result) => {
          reload();
          toast({ text: result.text, tone: 'ok' });
        }}
      />
    </div>
  );
}

function BookingActions({
  booking,
  phone,
  busy,
  onStatus,
  onSaved,
}: {
  booking: TeamBookingView;
  phone: string | null;
  busy: boolean;
  onStatus: (status: 'completed' | 'noShow' | 'confirmed') => void;
  onSaved: () => void;
}) {
  const act = useTeamAction();
  const [notes, setNotes] = useState(booking.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tel = phone?.replace(/[^\d+]/g, '') ?? '';

  async function save(event: SyntheticEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await act(`/api/team/bookings/${booking.id}/note`, teamStatusResponseSchema, {
        body: { notes: notes.trim() === '' ? null : notes },
      });
      onSaved();
    } catch {
      setError('The note did not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="exq-team-sheet">
      <p>
        {shopTime(booking.startAt)} to {shopTime(booking.endAt)}, {booking.services.join(', ')}
      </p>
      <p>
        <StatusChip status={booking.status} />
      </p>
      <div className="exq-team-next__actions">
        {booking.status === 'confirmed' ? (
          <>
            <Button
              size="lg"
              loading={busy}
              onClick={() => {
                onStatus('completed');
              }}
            >
              Done
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={busy}
              onClick={() => {
                onStatus('noShow');
              }}
            >
              No show
            </Button>
          </>
        ) : booking.status === 'cancelled' ? null : (
          <Button
            size="lg"
            variant="outline"
            loading={busy}
            onClick={() => {
              onStatus('confirmed');
            }}
          >
            Undo
          </Button>
        )}
      </div>
      <form className="exq-team-form" onSubmit={(e) => void save(e)}>
        <Textarea
          label="Note"
          hint="Only you and the owner see this."
          rows={3}
          maxLength={500}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
        />
        <TeamError message={error} />
        <Button type="submit" variant="outline" size="lg" loading={saving}>
          Save note
        </Button>
      </form>
      <p className="exq-muted">
        To move or cancel this booking, or to reach the client, call the shop.
      </p>
      {tel ? (
        <ButtonAnchor
          variant="outline"
          size="lg"
          href={`tel:${tel}`}
          icon={<Phone aria-hidden="true" />}
        >
          Call shop
        </ButtonAnchor>
      ) : null}
    </div>
  );
}
