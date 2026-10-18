import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { availabilityResponseSchema, type AvailabilitySlot } from '@shared/api/availability';
import {
  createBookingResponseSchema,
  type CreateBookingRequest,
  type CreateBookingResponse,
} from '@shared/api/bookings';
import {
  publicServicesResponseSchema,
  publicStaffListResponseSchema,
  publicStaffResponseSchema,
} from '@shared/api/public';
import { Status } from '@/components/Status';
import { Button, StepBar, StickyCTA, Ticket, TimeChip, useToast } from '@/components/ui';
import { formatCents } from '@shared/lib/money';
import { formatShopDateTime } from '@shared/lib/time';
import { BookingCard } from '@/components/booking/BookingCard';
import { BookingSummary } from '@/components/booking/BookingSummary';
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
import { usePageMeta } from '@/lib/usePageTitle';
import { useShop } from '@/app/useShop';

const STEPS = [
  { key: 'services', label: 'Services' },
  { key: 'barber', label: 'Chair' },
  { key: 'day', label: 'Day' },
  { key: 'time', label: 'Time' },
  { key: 'details', label: 'Details' },
  { key: 'confirm', label: 'Confirm' },
] as const;

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
  usePageMeta({
    title: 'Book a chair',
    description:
      'Pick a service, a chair and a time at Exquisite Barber & Beauty Lounge in Brookhaven, PA. Confirm in under a minute.',
  });
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const selection = useMemo(() => readSelection(params), [params]);
  const step = resolveStep(selection);

  const shop = useShop();
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
  // A time that arrived in the URL (a profile opening chip) is checked once; if it has gone,
  // the flow steps back to the times with a notice instead of failing at confirm.
  const [staleTime, setStaleTime] = useState<string | null>(null);
  const checkedTime = useRef<string | null>(null);

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

  const latestStartAt = useRef<string | null>(null);
  latestStartAt.current = selection.startAt;
  useEffect(() => {
    const { date, startAt, staff: who, serviceIds } = selection;
    if (!date || !startAt || !who || serviceIds.length === 0) return;
    if (step !== 'details' && step !== 'confirm') return;
    if (checkedTime.current === startAt) return;
    checkedTime.current = startAt;
    const query = new URLSearchParams({ date, serviceIds: serviceIds.join(','), staff: who });
    // Not aborted on cleanup: StrictMode runs effects twice in development and the check must land.
    apiRequest(`/api/availability?${query.toString()}`, availabilityResponseSchema)
      .then((result) => {
        if (latestStartAt.current !== startAt) return;
        if (result.slots.some((slot) => slot.startAt === startAt)) return;
        setStaleTime(startAt);
        setParams(writeSelection({ ...selection, startAt: null, step: 'time' }), { replace: true });
      })
      .catch(() => undefined);
  }, [selection, step, setParams]);

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
      <article className="exq-book exq-wrap exq-section" data-state="error">
        <h1 className="exq-book__title">Book your chair</h1>
        <Status state="error" />
      </article>
    );
  }
  if (shop.status !== 'ready' || services.status !== 'ready' || staff.status !== 'ready') {
    return (
      <article className="exq-book exq-wrap exq-section" data-state="loading">
        <h1 className="exq-book__title">Book your chair</h1>
        <Status state="loading" />
      </article>
    );
  }

  const allServices = services.data.services;
  const chosenServices = selection.serviceIds
    .map((id) => allServices.find((s) => s.id === id))
    .filter((s) => s !== undefined);
  const chosenStaff =
    selection.staff === 'any'
      ? 'Anyone available'
      : (staff.data.staff.find((s) => s.slug === selection.staff)?.name ?? null);
  const staffName = chosenStaff ?? 'Not chosen yet';
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
        toast({ text: 'That time was just taken. Pick one of the fresh times.', tone: 'warn' });
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
          <>
            {staleTime ? (
              <p className="exq-book-notice" role="alert" data-state="stale-time">
                That time was just taken. Here are the times still open.
              </p>
            ) : null}
            <TimePicker
              date={selection.date ?? ''}
              serviceIds={selection.serviceIds}
              staff={selection.staff ?? 'any'}
              selected={selection.startAt}
              version={refreshVersion}
              onPick={(slot) => {
                setStaleTime(null);
                update({ startAt: slot.startAt }, 'details');
              }}
            />
          </>
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
                            setParams(
                              writeSelection({
                                ...selection,
                                date: slot.startAt.slice(0, 10),
                                startAt: slot.startAt,
                                step: 'confirm',
                              }),
                            );
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        goTo('day');
                      }}
                    >
                      Pick another day
                    </Button>
                  </p>
                )}
              </div>
            ) : null}
            {submitError ? (
              <p className="exq-book-confirm__error" role="alert">
                {submitError}
              </p>
            ) : null}
            <StickyCTA
              primary={`${chosenServices.some((s) => s.priceFrom) ? 'From ' : ''}${formatCents(
                chosenServices.reduce((sum, s) => sum + s.priceCents, 0),
              )}`}
              secondary={`${String(chosenServices.reduce((sum, s) => sum + s.durationMinutes, 0))} min with ${staffName}`}
            >
              <Button loading={submitting} onClick={() => void submit()}>
                {submitting ? 'Booking' : 'Confirm booking'}
              </Button>
            </StickyCTA>
            <p className="exq-book-confirm__actions">
              <Button
                variant="secondary"
                disabled={submitting}
                onClick={() => {
                  goTo('details');
                }}
              >
                Edit details
              </Button>
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
        const booked = confirmation.booking;
        return (
          <div className="exq-book-done" data-state="booked">
            <Ticket
              code={booked.referenceCode}
              heading="You are booked"
              rows={[
                {
                  label: 'Chair',
                  value: `${booked.staff.name}${booked.staffRequested ? '' : ' (first available)'}`,
                },
                { label: 'When', value: formatShopDateTime(new Date(booked.startAt)) },
                { label: 'Services', value: booked.services.map((s) => s.name).join(', ') },
                {
                  label: 'For',
                  value: `${booked.customer.name}, ${booked.customer.phone}`,
                },
              ]}
              total={formatCents(booked.totalPriceCents)}
              actions={
                <>
                  <IcsDownload booking={booked} shop={shop.data} manageUrl={manageUrl} />
                  <Link
                    className="exq-btn"
                    data-variant="secondary"
                    data-size="md"
                    to={confirmation.managePath}
                  >
                    Manage this booking
                  </Link>
                </>
              }
            />
            <p className="exq-book-done__reference exq-visually-hidden">
              Reference code <strong className="exq-book-done__code">{booked.referenceCode}</strong>
            </p>
            {booked.customer.email ? (
              <p className="exq-book-done__email">
                A confirmation is on its way to {booked.customer.email}.
              </p>
            ) : null}
            {shop.data.demo === true ? (
              <p className="exq-book-done__demo" data-state="demo">
                Demo mode: no emails are sent, so here is the manage link a customer would get:{' '}
                <a className="exq-book-done__demo-link" href={manageUrl}>
                  {manageUrl}
                </a>
              </p>
            ) : null}
            <p className="exq-book-done__manage-url">
              Keep the confirmation email: its link lets you move or cancel this booking.
              {booked.customer.email ? null : (
                <>
                  {' '}
                  No email was given, so <a href={manageUrl}>save this manage link</a>.
                </>
              )}
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

  return (
    <article className="exq-book exq-wrap exq-section" data-state={step}>
      <div className="exq-book__main">
        <h1 className="exq-book__title">Book your chair</h1>
        <p className="exq-book__sub">Takes about a minute.</p>
        {step !== 'done' ? (
          <div className="exq-book-steps">
            <StepBar steps={STEPS} current={step} onJump={goTo} />
          </div>
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
      </div>
      {step !== 'done' ? (
        <BookingCard
          services={chosenServices}
          staffName={chosenStaff}
          startAt={selection.startAt}
          cancelCutoffMinutes={shop.data.booking.cancelCutoffMinutes}
          canConfirm={step === 'confirm' && !submitting}
          submitting={submitting}
          onConfirm={() => void submit()}
        />
      ) : null}
    </article>
  );
}
