import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { AvailabilitySlot } from '@shared/api/availability';
import {
  createBookingResponseSchema,
  type CreateBookingRequest,
  type CreateBookingResponse,
} from '@shared/api/bookings';
import {
  publicServicesResponseSchema,
  publicShopSchema,
  publicStaffListResponseSchema,
  publicStaffResponseSchema,
} from '@shared/api/public';
import { Status } from '@/components/Status';
import { BookingSummary } from '@/components/booking/BookingSummary';
import { viewToSummary } from '@/lib/booking/helpers';
import { CustomerForm } from '@/components/booking/CustomerForm';
import { DayPicker } from '@/components/booking/DayPicker';
import { IcsDownload } from '@/components/booking/IcsDownload';
import { ServicePicker } from '@/components/booking/ServicePicker';
import { StaffPicker } from '@/components/booking/StaffPicker';
import { StepHeading } from '@/components/booking/StepHeading';
import { TimePicker } from '@/components/booking/TimePicker';
import { ApiRequestError, apiRequest } from '@/lib/api';
import {
  clearIdempotencyKey,
  idempotencyKeyFor,
  loadConfirmation,
  loadDetails,
  readSelection,
  resolveStep,
  saveConfirmation,
  saveDetails,
  slotLabel,
  writeSelection,
  type BookSelection,
  type BookStep,
  type CustomerDetails,
} from '@/lib/booking/state';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';

const STEP_TITLES: Record<BookStep, string> = {
  services: 'Choose your services',
  barber: 'Choose your chair',
  day: 'Pick a day',
  time: 'Pick a time',
  details: 'Your details',
  confirm: 'Review and confirm',
  done: 'You are booked',
};

interface ConflictState {
  message: string;
  alternatives: AvailabilitySlot[];
}

export function BookPage() {
  usePageTitle('Book');
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const selection = useMemo(() => readSelection(params), [params]);
  const step = resolveStep(selection);

  const shop = useApi('/api/shop', publicShopSchema);
  const services = useApi('/api/services', publicServicesResponseSchema);
  const staff = useApi('/api/staff', publicStaffListResponseSchema);

  const [details, setDetails] = useState<CustomerDetails>(() => loadDetails());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [confirmation, setConfirmation] = useState<CreateBookingResponse | null>(() =>
    loadConfirmation(),
  );

  const update = (patch: Partial<BookSelection>, nextStep?: BookStep) => {
    const next: BookSelection = { ...selection, ...patch, step: nextStep ?? null };
    // Changing an earlier choice clears everything after it.
    if (patch.serviceIds !== undefined) {
      next.date = null;
      next.startAt = null;
    }
    if (patch.staff !== undefined || patch.date !== undefined) next.startAt = null;
    if (patch.staff !== undefined) next.date = null;
    setConflict(null);
    setParams(writeSelection(next));
  };

  const goTo = (target: BookStep) => {
    setParams(writeSelection({ ...selection, step: target }));
  };

  // An alias slug on a printed card resolves to the current slug and the address is corrected.
  useEffect(() => {
    if (staff.status !== 'ready' || !selection.staff || selection.staff === 'any') return;
    if (staff.data.staff.some((s) => s.slug === selection.staff)) return;
    const requested = selection.staff;
    apiRequest(`/api/staff/${encodeURIComponent(requested)}`, publicStaffResponseSchema)
      .then((result) => {
        setParams(writeSelection({ ...selection, staff: result.staff.slug }), { replace: true });
      })
      .catch(() => {
        setParams(writeSelection({ ...selection, staff: null }), { replace: true });
      });
  }, [staff, selection, setParams]);

  if (shop.status === 'error' || services.status === 'error' || staff.status === 'error') {
    return (
      <article className="exq-book" data-state="error">
        <h1 className="exq-book__title">Book a chair</h1>
        <Status state="error" />
      </article>
    );
  }
  if (shop.status !== 'ready' || services.status !== 'ready' || staff.status !== 'ready') {
    return (
      <article className="exq-book" data-state="loading">
        <h1 className="exq-book__title">Book a chair</h1>
        <Status state="loading" />
      </article>
    );
  }

  const allServices = services.data.services;
  const chosenServices = selection.serviceIds
    .map((id) => allServices.find((s) => s.id === id))
    .filter((s) => s !== undefined);
  const staffName =
    selection.staff === 'any'
      ? 'First available'
      : (staff.data.staff.find((s) => s.slug === selection.staff)?.name ?? 'Not chosen yet');
  const fingerprint = JSON.stringify([
    selection.serviceIds,
    selection.staff,
    selection.startAt,
    details.phone,
  ]);

  const submit = async () => {
    if (!selection.staff || !selection.startAt) return;
    setSubmitting(true);
    setSubmitError(null);
    setConflict(null);
    const body: CreateBookingRequest = {
      serviceIds: selection.serviceIds,
      staff: selection.staff,
      startAt: selection.startAt,
      customer: {
        name: details.name,
        phone: details.phone,
        email: details.email.trim() === '' ? null : details.email.trim(),
      },
      ...(details.notes.trim() ? { notes: details.notes.trim() } : {}),
    };
    try {
      const result = await apiRequest('/api/bookings', createBookingResponseSchema, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKeyFor(fingerprint) },
      });
      clearIdempotencyKey();
      saveConfirmation(result);
      setConfirmation(result);
      void navigate(
        `/book?${writeSelection({ serviceIds: [], staff: null, date: null, startAt: null, step: 'done' }).toString()}`,
      );
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'SLOT_TAKEN') {
        clearIdempotencyKey();
        setRefreshVersion((v) => v + 1);
        setConflict({ message: error.message, alternatives: error.alternatives ?? [] });
      } else if (error instanceof ApiRequestError) {
        clearIdempotencyKey();
        setSubmitError(error.message);
      } else {
        setSubmitError('We could not reach the shop. Please check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'services':
        return (
          <ServicePicker
            services={allServices}
            selected={selection.serviceIds}
            max={shop.data.booking.maxServicesPerBooking}
            onChange={(ids) => {
              update({ serviceIds: ids }, 'services');
            }}
            onContinue={() => {
              // A chair preselected from a card or a chair page skips straight to the calendar.
              goTo(selection.staff ? 'day' : 'barber');
            }}
          />
        );
      case 'barber':
        return (
          <StaffPicker
            staff={staff.data.staff}
            serviceIds={selection.serviceIds}
            selected={selection.staff}
            allowFirstAvailable={shop.data.booking.allowFirstAvailable}
            onChange={(selector) => {
              update({ staff: selector }, 'barber');
            }}
            onContinue={() => {
              goTo('day');
            }}
          />
        );
      case 'day':
        return (
          <DayPicker
            serviceIds={selection.serviceIds}
            staff={selection.staff ?? 'any'}
            selected={selection.date}
            version={refreshVersion}
            onPick={(date) => {
              update({ date }, 'time');
            }}
          />
        );
      case 'time':
        return (
          <TimePicker
            date={selection.date ?? ''}
            serviceIds={selection.serviceIds}
            staff={selection.staff ?? 'any'}
            selected={selection.startAt}
            version={refreshVersion}
            onPick={(slot) => {
              update({ startAt: slot.startAt }, 'details');
            }}
          />
        );
      case 'details':
        return (
          <CustomerForm
            initial={details}
            requireEmail={shop.data.booking.requireEmail}
            onSubmit={(next) => {
              setDetails(next);
              saveDetails(next);
              goTo('confirm');
            }}
          />
        );
      case 'confirm':
        return (
          <div
            className="exq-book-confirm"
            data-state={
              submitting ? 'submitting' : conflict ? 'conflict' : submitError ? 'error' : 'idle'
            }
          >
            <BookingSummary
              services={chosenServices}
              staffName={staffName}
              startAt={selection.startAt}
              customer={{ name: details.name, phone: details.phone, email: details.email || null }}
              notes={details.notes || null}
            />
            {conflict ? (
              <div className="exq-book-conflict" role="alert">
                <p className="exq-book-conflict__message">{conflict.message}</p>
                {conflict.alternatives.length > 0 ? (
                  <ul className="exq-book-conflict__list">
                    {conflict.alternatives.map((slot) => (
                      <li
                        key={`${slot.staffId}-${slot.startAt}`}
                        className="exq-book-conflict__option"
                      >
                        <button
                          type="button"
                          className="exq-button"
                          onClick={() => {
                            setConflict(null);
                            setParams(
                              writeSelection({
                                ...selection,
                                date: slot.startAt.slice(0, 10),
                                startAt: slot.startAt,
                                step: 'confirm',
                              }),
                            );
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
                ) : (
                  <p>
                    <button
                      type="button"
                      className="exq-button"
                      onClick={() => {
                        goTo('day');
                      }}
                    >
                      Pick another day
                    </button>
                  </p>
                )}
              </div>
            ) : null}
            {submitError ? (
              <p className="exq-book-confirm__error" role="alert">
                {submitError}
              </p>
            ) : null}
            <p className="exq-book-confirm__actions">
              <button
                type="button"
                className="exq-button exq-button--primary"
                disabled={submitting}
                onClick={() => void submit()}
              >
                {submitting ? 'Booking' : 'Confirm booking'}
              </button>
              <button
                type="button"
                className="exq-button"
                disabled={submitting}
                onClick={() => {
                  goTo('details');
                }}
              >
                Edit details
              </button>
            </p>
          </div>
        );
      case 'done': {
        if (!confirmation) {
          return (
            <p className="exq-book-done__empty">
              Nothing to show. <Link to="/book">Start a booking</Link>.
            </p>
          );
        }
        const manageUrl = `${window.location.origin}${confirmation.managePath}`;
        return (
          <div className="exq-book-done" data-state="booked">
            <p className="exq-book-done__reference">
              Reference code{' '}
              <strong className="exq-book-done__code">{confirmation.booking.referenceCode}</strong>
            </p>
            <BookingSummary
              services={viewToSummary(confirmation.booking)}
              staffName={confirmation.booking.staff.name}
              startAt={confirmation.booking.startAt}
              endAt={confirmation.booking.endAt}
              customer={confirmation.booking.customer}
              notes={confirmation.booking.notes}
            />
            {confirmation.booking.customer.email ? (
              <p className="exq-book-done__email">
                A confirmation is on its way to {confirmation.booking.customer.email}.
              </p>
            ) : null}
            <p className="exq-book-done__actions">
              <Link className="exq-button" to={confirmation.managePath}>
                Cancel or reschedule
              </Link>
              <IcsDownload booking={confirmation.booking} shop={shop.data} manageUrl={manageUrl} />
            </p>
            <p className="exq-book-done__manage-url">
              Keep this link to manage your booking: <a href={manageUrl}>{manageUrl}</a>
            </p>
            <p>
              <Link
                to="/book"
                onClick={() => {
                  saveConfirmation(null);
                  setConfirmation(null);
                }}
              >
                Book another appointment
              </Link>
            </p>
          </div>
        );
      }
    }
  };

  const stepIndex = ['services', 'barber', 'day', 'time', 'details', 'confirm'].indexOf(step);
  return (
    <article className="exq-book" data-state={step}>
      <h1 className="exq-book__title">Book a chair</h1>
      {step !== 'done' ? (
        <ol className="exq-book-steps" aria-label="Progress">
          {(['services', 'barber', 'day', 'time', 'details', 'confirm'] as const).map((s, i) => (
            <li
              key={s}
              className="exq-book-steps__item"
              data-state={i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo'}
              aria-current={i === stepIndex ? 'step' : undefined}
            >
              {i < stepIndex ? (
                <button
                  type="button"
                  className="exq-book-steps__link"
                  onClick={() => {
                    goTo(s);
                  }}
                >
                  {STEP_TITLES[s]}
                </button>
              ) : (
                STEP_TITLES[s]
              )}
            </li>
          ))}
        </ol>
      ) : null}
      <StepHeading step={step} focusKey={selection.startAt ?? ''}>
        {STEP_TITLES[step]}
      </StepHeading>
      {step !== 'services' && step !== 'done' ? (
        <section className="exq-book-selection" aria-label="Your selection">
          <BookingSummary
            services={chosenServices}
            staffName={staffName}
            startAt={selection.startAt}
          />
        </section>
      ) : null}
      {renderStep()}
    </article>
  );
}
