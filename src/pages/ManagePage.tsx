import Calendar from '@untitled-ui/icons-react/build/esm/Calendar';
import Clock from '@untitled-ui/icons-react/build/esm/Clock';
import MessageSquare01 from '@untitled-ui/icons-react/build/esm/MessageSquare01';
import Scissors01 from '@untitled-ui/icons-react/build/esm/Scissors01';
import User01 from '@untitled-ui/icons-react/build/esm/User01';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { AvailabilitySlot } from '@shared/api/availability';
import {
  manageBookingResponseSchema,
  rescheduleBookingResponseSchema,
  type ManageBookingResponse,
} from '@shared/api/bookings';
import { formatCents } from '@shared/lib/money';
import { formatUsPhone } from '@shared/lib/phone';
import { formatShopDate, formatShopDateTime, formatShopTime } from '@shared/lib/time';
import { Status } from '@/components/Status';
import { DayPicker } from '@/components/booking/DayPicker';
import { IcsDownload } from '@/components/booking/IcsDownload';
import { StepHeading } from '@/components/booking/StepHeading';
import { TimePicker } from '@/components/booking/TimePicker';
import { Button, ButtonLink, Link, Sheet, Ticket, TimeChip, useToast } from '@/components/ui';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { cutoffSpan } from '@/lib/booking/policy';
import { slotLabel } from '@/lib/booking/state';
import { useApi } from '@/lib/useApi';
import { usePageMeta } from '@/lib/usePageTitle';
import { useShop } from '@/app/useShop';

type Mode = 'view' | 'cancel' | 'reschedule' | 'cancelled' | 'rescheduled';

const ERROR_COPY: Record<string, string> = {
  INVALID_TOKEN: 'This link is not valid. If you rescheduled, use the link from your latest email.',
  TOKEN_EXPIRED: 'This link has expired.',
  BOOKING_CANCELLED: 'This booking was already cancelled.',
  NOT_FOUND: 'We could not find that booking.',
  RATE_LIMITED: 'Too many requests. Please wait a few minutes and try again.',
};

const STATUS_LABEL = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  noShow: 'No show',
  cancelled: 'Cancelled',
} as const;

export function ManagePage() {
  usePageMeta({ title: 'Manage your booking', noindex: true });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const token = params.get('token') ?? '';
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState<Mode>('view');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<AvailabilitySlot[] | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState<AvailabilitySlot | null>(null);
  const [override, setOverride] = useState<ManageBookingResponse | null>(null);

  const shop = useShop();
  const loaded = useApi(
    token ? `/api/bookings/manage?token=${encodeURIComponent(token)}` : null,
    manageBookingResponseSchema,
    { version },
  );
  const data = override ?? (loaded.status === 'ready' ? loaded.data : null);

  if (!token) {
    return (
      <article className="exq-manage exq-wrap exq-section" data-state="missing-token">
        <h1 className="exq-manage__title">Manage your booking</h1>
        <p className="exq-manage__notice">
          Open the link from your confirmation email to manage a booking.
        </p>
      </article>
    );
  }
  if (!data) {
    if (loaded.status === 'loading' || shop.status === 'loading') {
      return (
        <article className="exq-manage exq-wrap exq-section" data-state="loading">
          <h1 className="exq-manage__title">Manage your booking</h1>
          <Status state="loading" />
        </article>
      );
    }
    const code =
      loaded.status === 'error' && loaded.error instanceof ApiRequestError
        ? loaded.error.code
        : 'INTERNAL_ERROR';
    return (
      <article className="exq-manage exq-wrap exq-section" data-state="error">
        <h1 className="exq-manage__title">Manage your booking</h1>
        <Status
          state="error"
          message={ERROR_COPY[code] ?? 'Something went wrong. Please try again or call the shop.'}
        />
        <p>
          <Link to="/book">Book a new appointment</Link>
        </p>
      </article>
    );
  }

  const { booking } = data;
  const serviceIds = booking.services.map((s) => s.serviceId);

  const cancel = async () => {
    setWorking(true);
    setError(null);
    try {
      const result = await apiRequest('/api/bookings/manage/cancel', manageBookingResponseSchema, {
        method: 'POST',
        body: { token },
      });
      setOverride(result);
      setMode('cancelled');
      toast({ text: 'Your appointment is cancelled.', tone: 'ok' });
    } catch (e) {
      setError(
        e instanceof ApiRequestError ? e.message : 'We could not reach the shop. Please try again.',
      );
    } finally {
      setWorking(false);
    }
  };

  const reschedule = async () => {
    if (!newSlot) return;
    setWorking(true);
    setError(null);
    setConflict(null);
    try {
      const result = await apiRequest(
        '/api/bookings/manage/reschedule',
        rescheduleBookingResponseSchema,
        {
          method: 'POST',
          body: { token, startAt: newSlot.startAt },
        },
      );
      // The old link is now invalid. Moving to the new one refetches the booking with the new token.
      setMode('rescheduled');
      setNewSlot(null);
      setNewDate(null);
      toast({ text: 'Your appointment has been moved.', tone: 'ok' });
      void navigate(result.managePath, { replace: true });
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'SLOT_TAKEN') {
        setConflict(e.alternatives ?? []);
        setNewSlot(null);
        setVersion((v) => v + 1);
        toast({ text: 'That time was just taken. Pick one of the fresh times.', tone: 'warn' });
      } else {
        setError(
          e instanceof ApiRequestError
            ? e.message
            : 'We could not reach the shop. Please try again.',
        );
      }
    } finally {
      setWorking(false);
    }
  };

  const ticket = (
    <Ticket
      code={booking.referenceCode}
      heading={`Your booking, ${STATUS_LABEL[booking.status].toLowerCase()}`}
      state={
        booking.status === 'cancelled'
          ? 'cancelled'
          : booking.status === 'completed'
            ? 'completed'
            : 'confirmed'
      }
      rows={[
        { label: 'Chair', value: booking.staff.name, icon: <User01 aria-hidden="true" /> },
        {
          label: 'Day',
          value: formatShopDate(new Date(booking.startAt)),
          icon: <Calendar aria-hidden="true" />,
        },
        {
          label: 'Time',
          value: formatShopTime(new Date(booking.startAt)),
          icon: <Clock aria-hidden="true" />,
        },
        {
          label: 'Services',
          value: booking.services.map((s) => s.name).join(', '),
          icon: <Scissors01 aria-hidden="true" />,
        },
        {
          label: 'For',
          value: `${booking.customer.name}, ${formatUsPhone(booking.customer.phone)}`,
          icon: <User01 aria-hidden="true" />,
        },
        ...(booking.notes
          ? [{ label: 'Notes', value: booking.notes, icon: <MessageSquare01 aria-hidden="true" /> }]
          : []),
      ]}
      total={formatCents(booking.totalPriceCents)}
      actions={
        shop.status === 'ready' && booking.status === 'confirmed' ? (
          <IcsDownload booking={booking} shop={shop.data} manageUrl={window.location.href} />
        ) : undefined
      }
    />
  );

  return (
    <article className="exq-manage exq-wrap exq-section" data-state={mode}>
      <p className="exq-label">Your booking</p>
      <h1 className="exq-manage__title">Manage your booking</h1>
      <p className="exq-manage__reference">
        Reference code <strong className="exq-num">{booking.referenceCode}</strong>
      </p>
      {mode === 'view' || mode === 'cancel' ? (
        <section className="exq-manage-view" data-state={booking.status}>
          <StepHeading step="view">Your appointment</StepHeading>
          {ticket}
          {booking.status !== 'confirmed' ? (
            <p className="exq-manage-view__status" role="status">
              This booking is {STATUS_LABEL[booking.status].toLowerCase()}.
            </p>
          ) : null}
          <p className="exq-manage-view__actions">
            <Button
              disabled={!data.canReschedule}
              onClick={() => {
                setMode('reschedule');
                setError(null);
              }}
            >
              Reschedule
            </Button>
            <Button
              variant="outline"
              disabled={!data.canCancel}
              onClick={() => {
                setMode('cancel');
                setError(null);
              }}
            >
              Cancel appointment
            </Button>
          </p>
          {!data.canCancel && booking.status === 'confirmed' ? (
            <p className="exq-manage-view__cutoff">
              Online changes close {cutoffSpan(data.cutoffs.cancelMinutes)} before the appointment.
              Please call the shop to make changes now.
            </p>
          ) : null}
        </section>
      ) : null}

      <Sheet
        open={mode === 'cancel'}
        title="Cancel this appointment?"
        onClose={() => {
          // The close event also fires after a successful cancel; only a dismissal goes back to view.
          if (!working && mode === 'cancel') setMode('view');
        }}
      >
        <section className="exq-manage-cancel" data-state={working ? 'working' : 'idle'}>
          <p>
            {formatShopDateTime(new Date(booking.startAt))} with {booking.staff.name}. You can book
            again any time.
          </p>
          {error ? (
            <p role="alert" className="exq-manage__error">
              {error}
            </p>
          ) : null}
          <p className="exq-manage-cancel__actions">
            <Button loading={working} onClick={() => void cancel()}>
              {working ? 'Cancelling' : 'Yes, cancel it'}
            </Button>
            <Button
              variant="outline"
              disabled={working}
              onClick={() => {
                setMode('view');
              }}
            >
              Keep it
            </Button>
          </p>
        </section>
      </Sheet>

      {mode === 'cancelled' ? (
        <section className="exq-manage-cancelled" data-state="done">
          <StepHeading step="cancelled">Your appointment is cancelled</StepHeading>
          <p>We have let the shop know. Book again any time.</p>
          <p>
            <ButtonLink to="/book">Book a new appointment</ButtonLink>
          </p>
        </section>
      ) : null}

      {mode === 'reschedule' ? (
        <section
          className="exq-manage-reschedule"
          data-state={newSlot ? 'chosen' : newDate ? 'day' : 'idle'}
        >
          <StepHeading step="reschedule">Pick a new time with {booking.staff.name}</StepHeading>
          {conflict ? (
            <div className="exq-book-conflict" role="alert">
              <p className="exq-book-conflict__message">
                That time was just taken. Here are the next open times.
              </p>
              {conflict.length > 0 ? (
                <ul className="exq-book-conflict__list">
                  {conflict.map((slot) => (
                    <li key={slot.startAt} className="exq-book-conflict__option">
                      <TimeChip
                        label={`${new Date(slot.startAt).toLocaleDateString('en-US', {
                          timeZone: 'America/New_York',
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })} ${slotLabel(slot)}`}
                        startAt={slot.startAt}
                        onClick={() => {
                          setConflict(null);
                          setNewDate(slot.startAt.slice(0, 10));
                          setNewSlot(slot);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <DayPicker
            serviceIds={serviceIds}
            staff={booking.staff.slug}
            selected={newDate}
            version={version}
            onPick={(date) => {
              setNewDate(date);
              setNewSlot(null);
            }}
          />
          {newDate ? (
            <TimePicker
              date={newDate}
              serviceIds={serviceIds}
              staff={booking.staff.slug}
              selected={newSlot?.startAt ?? null}
              version={version}
              onPick={setNewSlot}
            />
          ) : null}
          {error ? (
            <p role="alert" className="exq-manage__error">
              {error}
            </p>
          ) : null}
          <p className="exq-manage-reschedule__actions">
            <Button
              disabled={!newSlot || working}
              loading={working}
              onClick={() => void reschedule()}
            >
              {working ? 'Moving' : newSlot ? `Move to ${slotLabel(newSlot)}` : 'Choose a time'}
            </Button>
            <Button
              variant="outline"
              disabled={working}
              onClick={() => {
                setMode('view');
                setNewDate(null);
                setNewSlot(null);
                setConflict(null);
              }}
            >
              Back
            </Button>
          </p>
        </section>
      ) : null}

      {mode === 'rescheduled' ? (
        <section className="exq-manage-rescheduled" data-state="done">
          <StepHeading step="rescheduled">Your appointment has been moved</StepHeading>
          {ticket}
          <p>
            <Button
              variant="outline"
              onClick={() => {
                setMode('view');
              }}
            >
              Back to your booking
            </Button>
          </p>
        </section>
      ) : null}
    </article>
  );
}
