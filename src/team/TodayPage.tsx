import { useEffect, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import Phone from '@untitled-ui/icons-react/build/esm/Phone';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import { seatResponseSchema } from '@shared/api/admin';
import { okResponseSchema } from '@shared/api/auth';
import { lineResponseSchema, type WalkInView } from '@shared/api/line';
import { publicShopSchema } from '@shared/api/public';
import {
  teamDayResponseSchema,
  teamOutTodayResponseSchema,
  teamStatusResponseSchema,
  type TeamBookingView,
  type TeamDayResponse,
} from '@shared/api/team';
import { currentBooking } from '@shared/lib/floor';
import { formatCents } from '@shared/lib/money';
import { discountTag } from '@shared/lib/launchOffer';
import {
  Button,
  ButtonAnchor,
  ButtonLink,
  ErrorState,
  Sheet,
  StatusChip,
  Textarea,
  useToast,
} from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { NewBookingFlow, type FlowIntent } from '@/booking-flow/NewBookingFlow';
import { Status } from '@/components/Status';
import { ApiRequestError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { Avatar } from '@/admin/components/Avatar';
import { firstNameLastInitial, shopDateLabel, shopTime } from '@/admin/format';
import { TeamError } from './TeamError';
import { useTeamAction, useTeamApi, useTeamMe, useTeamSession } from './useTeamSession';

/**
 * The barber's day: the next client as a big card with Done and No show, then the whole day.
 * Tapping any row opens the same actions. A client's phone number is never shown; the shop's
 * is one tap away instead.
 */
export function TodayPage() {
  usePageTitle('Today');
  const act = useTeamAction();
  const toast = useToast();
  const { signedOut } = useTeamSession();
  const [version, setVersion] = useState(0);
  const day = useTeamApi('/api/team/today', teamDayResponseSchema, version);
  const line = useTeamApi('/api/team/line', lineResponseSchema, version);
  const shop = useApi('/api/shop', publicShopSchema);
  const last = useRef<TeamDayResponse | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowIntent | null>(null);
  const [askOut, setAskOut] = useState(false);
  const me = useTeamMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  if (day.status === 'ready') last.current = day.data;
  const data = day.status === 'ready' ? day.data : last.current;
  const phone = shop.status === 'ready' ? shop.data.phone : null;
  const reload = () => {
    setVersion((v) => v + 1);
  };

  // Live: every 30 seconds while the tab is visible, and after each action.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

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

  /** Start cut on a booked client: arrived and started, the same stamps the floor uses. */
  async function startBooking(booking: TeamBookingView) {
    setBusy(booking.id);
    try {
      if (!booking.arrivedAt)
        await act(`/api/team/bookings/${booking.id}/arrived`, teamStatusResponseSchema, {
          body: {},
        });
      await act(`/api/team/bookings/${booking.id}/start`, teamStatusResponseSchema, { body: {} });
      reload();
      toast({ text: `Started ${booking.customerName}.`, tone: 'ok' });
    } catch {
      toast({ text: 'That did not save. Try again.', tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  /** Start cut on a walk-in from the line: a real booking starting now, through the slot locks. */
  async function seat(w: WalkInView) {
    setBusy(w.id);
    try {
      await act(`/api/team/line/${w.id}/seat`, seatResponseSchema, { body: {} });
      reload();
      toast({ text: `${w.name} is in your chair.`, tone: 'ok' });
    } catch (err) {
      toast({
        text:
          err instanceof ApiRequestError && err.code === 'CHAIR_BUSY'
            ? 'Your chair is not free for the full cut yet.'
            : 'That did not save. Try again.',
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  }

  async function outForTheDay() {
    setBusy('out');
    try {
      const result = await act('/api/team/out-today', teamOutTodayResponseSchema, { body: {} });
      setAskOut(false);
      reload();
      toast({
        text:
          result.clients > 0
            ? `You are out. The owner will move your ${String(result.clients)} ${result.clients === 1 ? 'client' : 'clients'}.`
            : 'You are out for the day.',
        tone: 'ok',
      });
    } catch {
      toast({ text: 'That did not save. Try again.', tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setLeaving(true);
    try {
      await act('/api/team/logout', okResponseSchema, { body: {} });
    } finally {
      signedOut();
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
  const now = new Date(data.now);
  const live = data.bookings.filter((b) => b.status === 'confirmed');
  const current =
    currentBooking(
      live.map((b) => ({
        id: b.id,
        status: b.status,
        startAt: new Date(b.startAt),
        endAt: new Date(b.endAt),
        durationMinutes: Math.round(
          (new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 60_000,
        ),
        startedAt: b.startedAt ? new Date(b.startedAt) : null,
      })),
      now,
    )?.id ?? null;
  const inChair = live.find((b) => b.id === current) ?? null;
  const waiting =
    line.status === 'ready'
      ? line.data.line.find((w) => w.staffId === me.staff.id || w.staffId === null)
      : undefined;
  const nextUp = inChair ? null : data.nextUp;
  const ordered = [
    ...live.slice().sort((a, b) => a.startAt.localeCompare(b.startAt)),
    ...data.bookings
      .filter((b) => b.status !== 'confirmed')
      .sort((a, b) => a.startAt.localeCompare(b.startAt)),
  ];
  const chairLabel =
    me.staff.chairNumber !== null
      ? `Chair ${String(me.staff.chairNumber).padStart(2, '0')}`
      : me.staff.title;
  const left = data.counts.left;

  return (
    <div className="exq-team-page" data-state={day.status === 'ready' ? 'ready' : 'refreshing'}>
      <header className="exq-team-head">
        <Avatar name={me.staff.name} photo={me.staff.photo} />
        <div className="exq-team-head__text">
          <p className="exq-label">
            {chairLabel} <span aria-hidden="true">·</span> {shopDateLabel(data.date)}
          </p>
          <h1>Hey, {me.staff.name.split(' ')[0]}</h1>
        </div>
        <Button variant="ghost" size="sm" loading={leaving} onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>

      <div className="exq-team-actions">
        <Button
          size="lg"
          variant="accent"
          icon={<Plus aria-hidden="true" />}
          onClick={() => {
            setFlow({ kind: 'new', now: true });
          }}
        >
          Add booking
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={data.isOut}
          onClick={() => {
            setAskOut(true);
          }}
        >
          Out for the day
        </Button>
        <ButtonLink to="/team/checkin" size="lg" variant="ghost" className="exq-team-actions__wide">
          Check in
        </ButtonLink>
      </div>

      {data.isOut ? (
        <p className="exq-team-note" role="status">
          You are marked out today. The owner has your clients.
        </p>
      ) : null}

      <section
        className="exq-team-chair"
        aria-labelledby="exq-team-chair-title"
        data-state={inChair ? 'busy' : 'free'}
      >
        <h2 id="exq-team-chair-title" className="exq-team-chair__label">
          In your chair
        </h2>
        {inChair ? (
          <>
            <p className="exq-team-chair__who">{inChair.customerName}</p>
            <p className="exq-muted">
              {inChair.services.join(', ')} <span aria-hidden="true">·</span>{' '}
              {formatCents(inChair.priceCents)}
              {discountTag(inChair.discounts) ? (
                <>
                  {' '}
                  <span aria-hidden="true">·</span> {discountTag(inChair.discounts)}
                </>
              ) : null}
              {inChair.startedAt
                ? ` · started ${shopTime(inChair.startedAt)}`
                : ` · ${shopTime(inChair.startAt)} to ${shopTime(inChair.endAt)}`}
            </p>
            {inChair.notes ? <p className="exq-team-chair__notes">{inChair.notes}</p> : null}
            <div className="exq-team-next__actions">
              <Button
                size="lg"
                loading={busy === inChair.id}
                onClick={() => void setStatus(inChair, 'completed')}
              >
                Done
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={busy === inChair.id}
                onClick={() => void setStatus(inChair, 'noShow')}
              >
                No show
              </Button>
            </div>
          </>
        ) : waiting ? (
          <>
            <p className="exq-team-chair__state">Free now</p>
            <p className="exq-team-chair__who">
              Walk-in #{waiting.position + 1}: {waiting.name}
            </p>
            <p className="exq-muted">
              {waiting.services.map((s) => s.name).join(', ')} <span aria-hidden="true">·</span>{' '}
              waiting {waiting.waitingMinutes} min
            </p>
            <Button
              size="lg"
              variant="accent"
              block
              loading={busy === waiting.id}
              onClick={() => void seat(waiting)}
            >
              Start cut
            </Button>
          </>
        ) : nextUp ? (
          <>
            <p className="exq-team-chair__state">Free now</p>
            <p className="exq-team-chair__who">{nextUp.customerName}</p>
            <p className="exq-muted">
              {shopTime(nextUp.startAt)} <span aria-hidden="true">·</span>{' '}
              {nextUp.services.join(', ')}
              {nextUp.arrivedAt ? ' · arrived' : ''}
            </p>
            <Button
              size="lg"
              variant="accent"
              block
              loading={busy === nextUp.id}
              onClick={() => void startBooking(nextUp)}
            >
              Start cut
            </Button>
          </>
        ) : (
          <>
            <p className="exq-team-chair__state">Free now</p>
            <p className="exq-muted">
              {data.working.ranges.length === 0 && !data.isOut
                ? 'You are not scheduled today.'
                : 'Nobody is waiting. Tap Add booking when someone sits down.'}
            </p>
          </>
        )}
      </section>

      {ordered.length > 0 ? (
        <section aria-labelledby="exq-team-list-title">
          <div className="exq-team-sub-row">
            <h2 id="exq-team-list-title" className="exq-team-sub">
              Today
            </h2>
            <span className="exq-label">
              {String(left)} left <span aria-hidden="true">·</span> {String(data.counts.done)} done
            </span>
          </div>
          <ul className="exq-team-list exq-bare">
            {ordered.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="exq-team-row"
                  data-state={b.status}
                  data-client={b.customerName}
                  onClick={() => {
                    setOpenId(b.id);
                  }}
                >
                  <span className="exq-team-row__time">{shopTime(b.startAt)}</span>
                  <span className="exq-team-row__body">
                    <strong>{firstNameLastInitial(b.customerName)}</strong>
                    <span>
                      {b.services.join(', ')} <span aria-hidden="true">·</span>{' '}
                      {formatCents(b.priceCents)}
                      {discountTag(b.discounts) ? `, ${discountTag(b.discounts) ?? ''}` : ''}
                    </span>
                  </span>
                  <span className="exq-team-row__tag exq-label" data-source={b.source}>
                    {b.status === 'confirmed' ? SOURCE_WORD[b.source] : STATUS_WORD[b.status]}
                  </span>
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

      <Dialog
        variant="full"
        open={askOut}
        title="Out for the day"
        onClose={() => {
          setAskOut(false);
        }}
      >
        <div className="exq-team-out">
          <h2 className="exq-team-out__title">Block the rest of today?</h2>
          <p className="exq-team-out__text">
            {left > 0
              ? `${String(left)} ${left === 1 ? 'client is' : 'clients are'} booked and the owner will be asked to move them. Nothing is cancelled by you.`
              : 'Nobody is booked for the rest of today.'}
          </p>
          <div className="exq-team-out__actions">
            <Button
              size="lg"
              variant="accent"
              loading={busy === 'out'}
              onClick={() => void outForTheDay()}
            >
              Block the rest of today
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setAskOut(false);
              }}
            >
              Keep working
            </Button>
          </div>
        </div>
      </Dialog>

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

const SOURCE_WORD: Record<TeamBookingView['source'], string> = {
  online: 'Booked',
  phone: 'Booked',
  owner: 'Booked',
  barber: 'Booked',
  walkIn: 'Walk-in',
};
const STATUS_WORD: Record<TeamBookingView['status'], string> = {
  confirmed: 'Booked',
  completed: 'Done',
  noShow: 'No show',
  cancelled: 'Cancelled',
};

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
