import { useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import Phone from '@untitled-ui/icons-react/build/esm/Phone';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import {
  publicServicesResponseSchema,
  publicShopSchema,
  publicStaffListResponseSchema,
} from '@shared/api/public';
import {
  teamDayResponseSchema,
  teamStatusResponseSchema,
  teamWalkInResponseSchema,
  type TeamBookingView,
  type TeamDayResponse,
} from '@shared/api/team';
import { formatCents } from '@shared/lib/money';
import {
  Button,
  ButtonAnchor,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  Sheet,
  StatusChip,
  Textarea,
  useToast,
} from '@/components/ui';
import { Status } from '@/components/Status';
import { ApiRequestError } from '@/lib/api';
import { offeredServices } from '@/lib/booking/offered';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { newIdempotencyKey, shopDateLabel, shopTime } from '@/admin/format';
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
  const [walkIn, setWalkIn] = useState(false);
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
        <Button
          size="lg"
          icon={<Plus aria-hidden="true" />}
          onClick={() => {
            setWalkIn(true);
          }}
        >
          Walk-in
        </Button>
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

      <Sheet
        open={walkIn}
        title="Walk-in"
        onClose={() => {
          setWalkIn(false);
        }}
      >
        <WalkInForm
          onDone={(name) => {
            setWalkIn(false);
            reload();
            toast({ text: `${name} is in your chair.`, tone: 'ok' });
          }}
        />
      </Sheet>
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

function WalkInForm({ onDone }: { onDone: (name: string) => void }) {
  const act = useTeamAction();
  const me = useTeamMe();
  const services = useApi('/api/services', publicServicesResponseSchema);
  const team = useApi('/api/staff', publicStaffListResponseSchema);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [key] = useState(newIdempotencyKey);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (chosen.length === 0) {
      setError('Pick at least one service.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await act('/api/team/walk-ins', teamWalkInResponseSchema, {
        body: { name, phone, serviceIds: chosen },
        headers: { 'Idempotency-Key': key },
      });
      onDone(name.trim());
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.details?.[0]
          ? `${err.details[0].path}: ${err.details[0].message}`
          : err instanceof ApiRequestError
            ? err.message
            : 'That did not save. Try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  if (services.status === 'loading' || team.status === 'loading') return <Status state="loading" />;
  if (services.status === 'error') return <Status state="error" />;
  // Only the services on this barber's own menu: another chair's would be refused. If the menu
  // cannot be read, every service is listed and the server decides.
  const menu =
    team.status === 'ready' ? team.data.staff.find((m) => m.id === me.staff.id)?.serviceIds : null;
  const offered = offeredServices(services.data.services, menu);
  return (
    <form className="exq-team-form" onSubmit={(e) => void submit(e)}>
      <Input
        label="Name"
        required
        maxLength={80}
        autoComplete="off"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <Input
        label="Mobile phone"
        hint="So the shop can reach them. You will not see it again."
        type="tel"
        inputMode="tel"
        required
        autoComplete="off"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
        }}
      />
      <fieldset className="exq-fieldset">
        <legend>Services</legend>
        {offered.length === 0 ? (
          <p className="exq-muted">You have no services set up yet. Ask the owner to add them.</p>
        ) : null}
        {offered.map((s) => (
          <Checkbox
            key={s.id}
            label={`${s.name}, ${formatCents(s.priceCents)}`}
            checked={chosen.includes(s.id)}
            onChange={(e) => {
              setChosen((prev) =>
                e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
              );
            }}
          />
        ))}
      </fieldset>
      <TeamError message={error} />
      <Button type="submit" size="lg" loading={working}>
        Start now
      </Button>
    </form>
  );
}
