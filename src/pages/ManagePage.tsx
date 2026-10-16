import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { AvailabilitySlot } from '@shared/api/availability';
import {
  manageBookingResponseSchema,
  rescheduleBookingResponseSchema,
  type ManageBookingResponse,
} from '@shared/api/bookings';
import { publicShopSchema } from '@shared/api/public';
import { Status } from '@/components/Status';
import { BookingSummary } from '@/components/booking/BookingSummary';
import { viewToSummary } from '@/lib/booking/helpers';
import { DayPicker } from '@/components/booking/DayPicker';
import { IcsDownload } from '@/components/booking/IcsDownload';
import { StepHeading } from '@/components/booking/StepHeading';
import { TimePicker } from '@/components/booking/TimePicker';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { slotLabel } from '@/lib/booking/state';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';

type Mode = 'view' | 'cancel' | 'reschedule' | 'cancelled' | 'rescheduled';

const ERROR_COPY: Record<string, string> = {
  INVALID_TOKEN: 'This link is not valid. If you rescheduled, use the link from your latest email.',
  TOKEN_EXPIRED: 'This link has expired.',
  BOOKING_CANCELLED: 'This booking was already cancelled.',
  NOT_FOUND: 'We could not find that booking.',
  RATE_LIMITED: 'Too many requests. Please wait a few minutes and try again.',
};

export function ManagePage() {
  usePageTitle('Manage your booking');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState<Mode>('view');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<AvailabilitySlot[] | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState<AvailabilitySlot | null>(null);
  const [override, setOverride] = useState<ManageBookingResponse | null>(null);

  const shop = useApi('/api/shop', publicShopSchema);
  const loaded = useApi(
    token ? `/api/bookings/manage?token=${encodeURIComponent(token)}` : null,
    manageBookingResponseSchema,
    { version },
  );
  const data = override ?? (loaded.status === 'ready' ? loaded.data : null);

  if (!token) {
    return (
      <article className="exq-manage" data-state="missing-token">
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
        <article className="exq-manage" data-state="loading">
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
      <article className="exq-manage" data-state="error">
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
      void navigate(result.managePath, { replace: true });
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'SLOT_TAKEN') {
        setConflict(e.alternatives ?? []);
        setNewSlot(null);
        setVersion((v) => v + 1);
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

  const summary = (
    <BookingSummary
      services={viewToSummary(booking)}
      staffName={booking.staff.name}
      startAt={booking.startAt}
      endAt={booking.endAt}
      customer={booking.customer}
      notes={booking.notes}
    />
  );

  return (
    <article className="exq-manage" data-state={mode}>
      <h1 className="exq-manage__title">Manage your booking</h1>
      <p className="exq-manage__reference">
        Reference code <strong>{booking.referenceCode}</strong>
      </p>
      {mode === 'view' ? (
        <section className="exq-manage-view" data-state={booking.status}>
          <StepHeading step="view">Your appointment</StepHeading>
          {summary}
          {booking.status !== 'confirmed' ? (
            <p className="exq-manage-view__status" role="status">
              This booking is {booking.status === 'cancelled' ? 'cancelled' : booking.status}.
            </p>
          ) : null}
          <p className="exq-manage-view__actions">
            <button
              type="button"
              className="exq-button"
              disabled={!data.canReschedule}
              onClick={() => {
                setMode('reschedule');
                setError(null);
              }}
            >
              Reschedule
            </button>
            <button
              type="button"
              className="exq-button exq-button--danger"
              disabled={!data.canCancel}
              onClick={() => {
                setMode('cancel');
                setError(null);
              }}
            >
              Cancel appointment
            </button>
            {shop.status === 'ready' && booking.status === 'confirmed' ? (
              <IcsDownload booking={booking} shop={shop.data} manageUrl={window.location.href} />
            ) : null}
          </p>
          {!data.canCancel && booking.status === 'confirmed' ? (
            <p className="exq-manage-view__cutoff">
              Online changes close {data.cutoffs.cancelMinutes / 60} hours before the appointment.
              Please call the shop to make changes now.
            </p>
          ) : null}
        </section>
      ) : null}

      {mode === 'cancel' ? (
        <section className="exq-manage-cancel" data-state={working ? 'working' : 'idle'}>
          <StepHeading step="cancel">Cancel this appointment?</StepHeading>
          {summary}
          {error ? (
            <p role="alert" className="exq-manage__error">
              {error}
            </p>
          ) : null}
          <p className="exq-manage-cancel__actions">
            <button
              type="button"
              className="exq-button exq-button--danger"
              disabled={working}
              onClick={() => void cancel()}
            >
              {working ? 'Cancelling' : 'Yes, cancel it'}
            </button>
            <button
              type="button"
              className="exq-button"
              disabled={working}
              onClick={() => {
                setMode('view');
              }}
            >
              Keep it
            </button>
          </p>
        </section>
      ) : null}

      {mode === 'cancelled' ? (
        <section className="exq-manage-cancelled" data-state="done">
          <StepHeading step="cancelled">Your appointment is cancelled</StepHeading>
          <p>We have let the shop know. Book again any time.</p>
          <p>
            <Link className="exq-button exq-button--primary" to="/book">
              Book a new appointment
            </Link>
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
              <p>That time was just taken. Here are the next open times.</p>
              {conflict.length > 0 ? (
                <ul className="exq-book-conflict__list">
                  {conflict.map((slot) => (
                    <li key={slot.startAt} className="exq-book-conflict__option">
                      <button
                        type="button"
                        className="exq-button"
                        onClick={() => {
                          setConflict(null);
                          setNewDate(slot.startAt.slice(0, 10));
                          setNewSlot(slot);
                        }}
                      >
                        {new Date(slot.startAt).toLocaleDateString('en-US', {
                          timeZone: 'America/New_York',
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        at {slotLabel(slot)}
                      </button>
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
            <button
              type="button"
              className="exq-button exq-button--primary"
              disabled={!newSlot || working}
              onClick={() => void reschedule()}
            >
              {working ? 'Moving' : newSlot ? `Move to ${slotLabel(newSlot)}` : 'Choose a time'}
            </button>
            <button
              type="button"
              className="exq-button"
              disabled={working}
              onClick={() => {
                setMode('view');
                setNewDate(null);
                setNewSlot(null);
                setConflict(null);
              }}
            >
              Back
            </button>
          </p>
        </section>
      ) : null}

      {mode === 'rescheduled' ? (
        <section className="exq-manage-rescheduled" data-state="done">
          <StepHeading step="rescheduled">Your appointment has been moved</StepHeading>
          {summary}
          <p>
            <button
              type="button"
              className="exq-button"
              onClick={() => {
                setMode('view');
              }}
            >
              Back to your booking
            </button>
          </p>
        </section>
      ) : null}
    </article>
  );
}
