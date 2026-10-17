import { useState } from 'react';
import { Link } from 'react-router';
import {
  bookingResponseSchema,
  scheduleResponseSchema,
  todayResponseSchema,
  type AdminBookingView,
  type ScheduleResponse,
} from '@shared/api/admin';
import type { BookingStatus } from '@shared/schemas/booking';
import { Card, ChipLink, useToast } from '@/components/ui';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { STATUS_LABEL, money, shopDateLabel, shopTime } from '../format';

const SEGMENTS: BookingStatus[] = ['confirmed', 'completed', 'noShow'];

/** One card per chair: what is in the chair now, who is next, and a status switch with undo. */
export function TodayPage() {
  usePageTitle('Today');
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const today = useApi('/api/admin/today', todayResponseSchema, { version });
  const schedule = useApi('/api/admin/schedule', scheduleResponseSchema, { version });
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => {
    setVersion((v) => v + 1);
  };

  async function setStatus(booking: AdminBookingView, to: BookingStatus, quiet = false) {
    setBusy(booking.id);
    try {
      await apiRequest(`/api/admin/bookings/${booking.id}/status`, bookingResponseSchema, {
        method: 'POST',
        body: { status: to, notify: false },
      });
      refresh();
      if (!quiet) {
        const from = booking.status;
        toast({
          text: `${booking.customer.name}: ${STATUS_LABEL[to].toLowerCase()}.`,
          tone: 'ok',
          action: {
            label: 'Undo',
            onClick: () => {
              void setStatus({ ...booking, status: to }, from, true);
            },
          },
        });
      }
    } catch (err) {
      toast({ text: err instanceof Error ? err.message : 'That did not save.', tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  if (today.status !== 'ready') {
    return (
      <article className="exq-adm-today" data-state={today.status}>
        <h1 className="exq-adm-today__title">Today</h1>
        <Status state={today.status} />
      </article>
    );
  }
  const t = today.data;
  const now = new Date(t.now).getTime();
  const chairs: ScheduleResponse['chairs'] =
    schedule.status === 'ready' ? schedule.data.chairs : [];

  return (
    <article className="exq-adm-today" data-state="ready">
      <h1 className="exq-adm-today__title">Today, {shopDateLabel(t.date)}</h1>
      <p
        className="exq-adm-today__new exq-chips"
        data-state={t.counts.newOnline > 0 ? 'new' : 'none'}
      >
        <ChipLink
          to="/admin/bookings?source=online&status=confirmed"
          count={t.counts.newOnline}
          tone="accent"
          selected={t.counts.newOnline > 0}
        >
          New online bookings
        </ChipLink>
        <ChipLink to="/admin/whos-in" count={t.chairsWorking}>
          In today
        </ChipLink>
      </p>
      <dl className="exq-adm-today__stats">
        <div>
          <dt>Chairs booked</dt>
          <dd data-stat="chairs-booked">
            {t.chairsBooked} <span className="exq-muted">of {t.chairsWorking}</span>
          </dd>
        </div>
        <div>
          <dt>Bookings</dt>
          <dd data-stat="bookings">{t.counts.total - t.counts.cancelled}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd data-stat="completed">{t.counts.completed}</dd>
        </div>
        <div>
          <dt>Expected</dt>
          <dd data-stat="expected-revenue">{money(t.expectedRevenueCents)}</dd>
        </div>
      </dl>

      <section className="exq-adm-today__next" aria-labelledby="exq-adm-today-chairs">
        <h2 id="exq-adm-today-chairs">Chairs</h2>
        {schedule.status === 'loading' ? <Status state="loading" /> : null}
        <div className="exq-adm-today__chairs">
          {chairs.map((chair) => {
            const live = chair.bookings
              .filter((b) => b.status !== 'cancelled')
              .sort((a, b) => a.startAt.localeCompare(b.startAt));
            const current =
              live.find(
                (b) =>
                  new Date(b.startAt).getTime() <= now &&
                  new Date(b.endAt).getTime() > now &&
                  b.status === 'confirmed',
              ) ?? null;
            const next =
              live.find((b) => b.status === 'confirmed' && new Date(b.startAt).getTime() > now) ??
              null;
            const who = t.whoIsIn.find((w) => w.staff.id === chair.staff.id);
            return (
              <Card
                key={chair.staff.id}
                as="section"
                className="exq-adm-chair"
                data-state={who?.status ?? 'in'}
              >
                <div className="exq-adm-chair__head">
                  <h3 className="exq-adm-chair__name">{chair.staff.name}</h3>
                  <span className="exq-adm-chair__hours">
                    {chair.working.ranges.length > 0
                      ? chair.working.ranges
                          .map((r) => `${shopTime(r.startAt)} to ${shopTime(r.endAt)}`)
                          .join(', ')
                      : chair.working.reason === 'closed'
                        ? 'Closed'
                        : 'Off today'}
                  </span>
                </div>
                <Slot
                  label="Now"
                  booking={current}
                  empty={live.length === 0 ? 'Nothing booked today' : 'Chair is free'}
                  busy={busy}
                  onStatus={(b, to) => void setStatus(b, to)}
                />
                <Slot
                  label="Next"
                  booking={next}
                  empty="Nothing else today"
                  busy={busy}
                  onStatus={(b, to) => void setStatus(b, to)}
                />
                {live.length > 0 ? (
                  <p className="exq-adm-chair__count exq-muted">
                    {live.filter((b) => b.status === 'completed').length} of {live.length} done.{' '}
                    <Link to={`/admin/schedule?staffId=${chair.staff.id}`}>Full day</Link>
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      </section>
    </article>
  );
}

function Slot({
  label,
  booking,
  empty,
  busy,
  onStatus,
}: {
  label: 'Now' | 'Next';
  booking: AdminBookingView | null;
  empty: string;
  busy: string | null;
  onStatus: (booking: AdminBookingView, to: BookingStatus) => void;
}) {
  return (
    <div className="exq-adm-chair__slot" data-state={booking ? label.toLowerCase() : 'empty'}>
      <span className="exq-adm-chair__label">{label}</span>
      {booking ? (
        <>
          <Link className="exq-adm-chair__client" to={`/admin/bookings/${booking.id}`}>
            {shopTime(booking.startAt)} {booking.customer.name}
            {booking.isNew ? <span className="exq-adm-bookings__new"> New</span> : null}
          </Link>
          <span className="exq-adm-chair__services">
            {booking.services.map((s) => s.name).join(', ')}, {money(booking.totalPriceCents)}
          </span>
          <div className="exq-seg" role="group" aria-label={`Status of ${booking.customer.name}`}>
            {SEGMENTS.map((status) => (
              <button
                key={status}
                type="button"
                className="exq-seg__btn"
                data-state={booking.status === status ? 'selected' : 'idle'}
                aria-pressed={booking.status === status}
                disabled={busy === booking.id || booking.status === status}
                onClick={() => {
                  onStatus(booking, status);
                }}
              >
                {STATUS_LABEL[status]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <span className="exq-adm-chair__empty">{empty}</span>
      )}
    </div>
  );
}
