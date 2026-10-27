import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Clock from '@untitled-ui/icons-react/build/esm/Clock';
import {
  bookingResponseSchema,
  customerListResponseSchema,
  type AdminBookingView,
  type CustomerListResponse,
} from '@shared/api/admin';
import type { WaitEstimateView } from '@shared/api/line';
import {
  menuPrice,
  quoteFirstAvailable,
  quoteForStaff,
  resolveServiceForStaff,
} from '@shared/lib/servicePricing';
import { DayPicker } from '@/components/booking/DayPicker';
import { TimePicker } from '@/components/booking/TimePicker';
import { Button, Input, Modal, StepBar, Textarea, type Step } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { offeredServices } from '@/lib/booking/offered';
import {
  money,
  newIdempotencyKey,
  shopDateTime,
  shopParts,
  shopTime,
  todayInShop,
} from '@/admin/format';
import { estimateLabel } from '@/admin/today/estimateLabel';
import {
  bookedSchema,
  nowSchema,
  useChairEstimates,
  useFlowData,
  type FlowService,
  type FlowSession,
} from './flowData';
import './flow.css';

export type FlowStep = 'service' | 'barber' | 'time' | 'client' | 'confirm' | 'done';

/** What the flow is for: a new booking, moving one to another barber, or a new time for one. */
export interface FlowIntent {
  kind: 'new' | 'move' | 'reschedule';
  /** For move and reschedule: the booking being changed. */
  booking?: AdminBookingView;
  /** Prefill for a new booking. */
  serviceIds?: string[];
  staffId?: string | null;
  startAt?: string;
  /** Start on the Time step with NOW in view. */
  now?: boolean;
}

export interface FlowResult {
  kind: 'booking' | 'line';
  text: string;
  bookingId?: string;
}

interface Props {
  open: boolean;
  session: FlowSession;
  /** A barber's own chair: the Barber step is skipped and every booking lands there. */
  ownChair?: { id: string; name: string } | undefined;
  /** The tablet check in: bigger tiles, always NOW, no client search. */
  checkIn?: boolean;
  intent: FlowIntent;
  onClose: () => void;
  onDone: (result: FlowResult) => void;
}

interface Picked {
  serviceIds: string[];
  staffId: string | null;
  /** 'now' or an ISO instant. */
  when: string | null;
  name: string;
  phone: string;
  email: string;
  notes: string;
  override: boolean;
}

const FIRST = 'any';

/**
 * The one booking flow, full screen: Service, Barber (owner), Time (NOW first), Client, Confirm,
 * then a ticket. Every booking goes through the booking service and its slot locks; NOW goes
 * through the NOW route, which books the minute when the chair is free and joins the line when it
 * is not. Move and Reschedule reuse the same steps on an existing booking.
 */
/** "chair 3 for Drew", or "Drew's chair" when the chair has no number. */
function chairWord(chairNumber: number | null, name: string): string {
  return chairNumber !== null ? `chair ${String(chairNumber)} for ${name}` : `${name}'s chair`;
}

export function NewBookingFlow({
  open,
  session,
  ownChair,
  checkIn = false,
  intent,
  onClose,
  onDone,
}: Props) {
  const data = useFlowData(session, open);
  const [tick, setTick] = useState(0);
  const estimates = useChairEstimates(session, open, tick);
  const fixedChair = ownChair ?? null;
  const steps = useMemo<Step<FlowStep>[]>(() => {
    const list: Step<FlowStep>[] = [{ key: 'service', label: 'Service' }];
    if (!fixedChair && intent.kind !== 'reschedule') list.push({ key: 'barber', label: 'Barber' });
    if (!checkIn) list.push({ key: 'time', label: 'Time' });
    if (intent.kind === 'new') list.push({ key: 'client', label: 'Client' });
    list.push({ key: 'confirm', label: 'Confirm' });
    return list;
  }, [fixedChair, checkIn, intent.kind]);

  const initial = useCallback((): { step: FlowStep; picked: Picked } => {
    const b = intent.booking;
    const picked: Picked = {
      serviceIds: b ? b.services.map((s) => s.serviceId) : (intent.serviceIds ?? []),
      staffId: fixedChair?.id ?? (b ? b.staff.id : (intent.staffId ?? null)),
      when: checkIn ? 'now' : intent.now ? 'now' : (intent.startAt ?? null),
      name: b?.customer.name ?? '',
      phone: b?.customer.phone ?? '',
      email: b?.customer.email ?? '',
      notes: '',
      override: false,
    };
    const step: FlowStep =
      intent.kind === 'move'
        ? 'barber'
        : intent.kind === 'reschedule'
          ? 'time'
          : intent.now && picked.serviceIds.length > 0
            ? 'time'
            : 'service';
    return { step, picked };
  }, [intent, fixedChair, checkIn]);

  const [step, setStep] = useState<FlowStep>(() => initial().step);
  const [picked, setPicked] = useState<Picked>(() => initial().picked);
  const [dirty, setDirty] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<ApiRequestError | Error | null>(null);
  const [result, setResult] = useState<FlowResult | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const [day, setDay] = useState(() =>
    intent.startAt ? shopParts(intent.startAt).date : todayInShop(),
  );

  // A fresh open starts over.
  useEffect(() => {
    if (!open) return;
    const start = initial();
    setStep(start.step);
    setPicked(start.picked);
    setDirty(false);
    setError(null);
    setResult(null);
    setWorking(false);
    setKey(newIdempotencyKey());
    setDay(
      start.picked.when && start.picked.when !== 'now'
        ? shopParts(start.picked.when).date
        : todayInShop(),
    );
    setTick((t) => t + 1);
    // Only a fresh open resets; the intent and chair are read then.
  }, [open]);

  const update = (patch: Partial<Picked>) => {
    setPicked((p) => ({ ...p, ...patch }));
    setDirty(true);
    setError(null);
  };

  const ready = data !== 'loading' && data !== 'error' ? data : null;
  const chairs = ready ? [...ready.chairs].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const chair = picked.staffId ? (chairs.find((c) => c.id === picked.staffId) ?? null) : null;
  const pool = chairs.filter((c) => c.acceptsOnlineBooking && c.showOnWebsite);
  const shown = ready ? offeredServices(ready.services, chair?.serviceIds ?? null) : [];
  const chosen = shown.filter((s) => picked.serviceIds.includes(s.id));
  const priceOf = (s: FlowService) =>
    chair ? resolveServiceForStaff(s, chair) : menuPrice(s, pool);
  const quote =
    chosen.length === 0
      ? null
      : chair
        ? quoteForStaff(chosen, chair)
        : intent.booking
          ? {
              totalCents: intent.booking.totalPriceCents,
              totalMinutes: intent.booking.durationMinutes,
              from: false,
            }
          : quoteFirstAvailable(chosen, pool);
  const chairEstimate = (id: string): WaitEstimateView =>
    estimates.chairs.find((c) => c.staffId === id)?.estimate ?? { kind: 'unknown' };
  const firstFree = estimates.chairs.find((c) => c.estimate.kind === 'free');
  // The hours rule: NOW is only offered while the shop is open and the barber is in.
  const gate = chair
    ? (estimates.chairs.find((c) => c.staffId === chair.id)?.gate ?? null)
    : estimates.firstAvailable;
  const nowAllowed = gate === null || gate.kind === 'open';
  const nowEstimate: WaitEstimateView = chair
    ? chairEstimate(chair.id)
    : firstFree
      ? { kind: 'free' }
      : (estimates.chairs
          .map((c) => c.estimate)
          .filter((e): e is Extract<WaitEstimateView, { kind: 'about' }> => e.kind === 'about')
          .sort((a, b) => a.minutes - b.minutes)[0] ?? { kind: 'unknown' });

  const index = steps.findIndex((s) => s.key === step);
  const canContinue = (): boolean => {
    if (step === 'service') return chosen.length > 0;
    if (step === 'barber')
      return intent.kind !== 'move' || picked.staffId !== intent.booking?.staff.id;
    if (step === 'time') return picked.when !== null;
    if (step === 'client') return picked.name.trim() !== '' && picked.phone.trim() !== '';
    return true;
  };
  const next = () => {
    const after = steps[index + 1];
    if (after) setStep(after.key);
  };
  const back = () => {
    const before = steps[index - 1];
    if (before) setStep(before.key);
  };

  const requestClose = () => {
    if (result || !dirty) onClose();
    else setAskDiscard(true);
  };

  async function confirm() {
    setWorking(true);
    setError(null);
    const staffSelector = chair?.slug ?? FIRST;
    const customer = {
      name: picked.name.trim(),
      phone: picked.phone.trim(),
      email: picked.email.trim() ? picked.email.trim() : null,
    };
    const notes = picked.notes.trim() ? { notes: picked.notes.trim() } : {};
    try {
      if (intent.kind !== 'new' && intent.booking) {
        const b = intent.booking;
        const done = await apiRequest(
          `/api/admin/bookings/${b.id}/reschedule`,
          bookingResponseSchema,
          {
            method: 'POST',
            body: {
              startAt: picked.when,
              ...(chair && chair.id !== b.staff.id ? { staff: chair.slug } : {}),
              notify: b.customer.email !== null,
              override: picked.override,
            },
          },
        );
        setResult({
          kind: 'booking',
          bookingId: done.booking.id,
          text: `Moved: ${shopDateTime(done.booking.startAt)} with ${done.booking.staff.name}`,
        });
      } else if (picked.when === 'now') {
        const done = await apiRequest(
          session === 'owner' ? '/api/admin/now' : '/api/team/now',
          nowSchema,
          {
            method: 'POST',
            headers: { 'Idempotency-Key': key },
            body: { serviceIds: picked.serviceIds, staffId: chair?.id ?? null, customer, ...notes },
          },
        );
        setResult(
          done.kind === 'booking'
            ? {
                kind: 'booking',
                bookingId: done.booking.id,
                text: checkIn
                  ? `Head to ${chairWord(chairs.find((c) => c.id === done.booking.staff.id)?.chairNumber ?? null, done.booking.staff.name)}`
                  : `In the chair now with ${done.booking.staff.name}`,
              }
            : {
                kind: 'line',
                text: `${checkIn ? "You're" : 'Walk-in'} #${String(done.walkIn.position + 1)} for ${done.walkIn.staffName}, ${estimateLabel(done.walkIn.estimate)}`,
              },
        );
      } else if (session === 'owner') {
        const done = await apiRequest('/api/admin/bookings', bookedSchema, {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: {
            source: 'phone',
            serviceIds: picked.serviceIds,
            staff: staffSelector,
            startAt: picked.when,
            customer,
            ...notes,
            override: picked.override,
            notifyCustomer: customer.email !== null,
          },
        });
        setResult({
          kind: 'booking',
          bookingId: done.booking.id,
          text: `Booked: ${shopDateTime(done.booking.startAt)} with ${done.booking.staff.name}`,
        });
      } else {
        const done = await apiRequest('/api/team/bookings', bookedSchema, {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: { serviceIds: picked.serviceIds, startAt: picked.when, customer, ...notes },
        });
        setResult({
          kind: 'booking',
          bookingId: done.booking.id,
          text: `Booked: ${shopDateTime(done.booking.startAt)} with ${done.booking.staff.name}`,
        });
      }
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('That did not go through.'));
      setKey(newIdempotencyKey());
      if (err instanceof ApiRequestError && err.code === 'SLOT_TAKEN') {
        update({ when: null });
        setStep('time');
        setTick((t) => t + 1);
      }
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    if (step === 'done' && result) onDone(result);
    // onDone is a notification; the ticket stays until Done is tapped.
  }, [step]);

  const title =
    intent.kind === 'move'
      ? 'Move booking'
      : intent.kind === 'reschedule'
        ? 'Reschedule'
        : checkIn
          ? 'Walk in'
          : 'New booking';
  const alternatives =
    error instanceof ApiRequestError && error.code === 'SLOT_TAKEN'
      ? (error.alternatives ?? [])
      : [];

  return (
    <Dialog variant="full" open={open} title={title} onClose={requestClose} closeLabel="Close">
      <div className="exq-flow" data-step={step} data-checkin={checkIn ? 'true' : 'false'}>
        {step !== 'done' ? (
          <div className="exq-flow__steps">
            <StepBar
              steps={steps}
              current={step}
              onJump={(k) => {
                if (steps.findIndex((s) => s.key === k) < index) setStep(k);
              }}
            />
          </div>
        ) : null}

        <div className="exq-flow__body">
          <div className="exq-flow__main">
            {data === 'loading' ? (
              <p className="exq-flow__status" aria-busy="true">
                Loading the menu
              </p>
            ) : data === 'error' ? (
              <p className="exq-flow__status" role="alert">
                The menu did not load. Close and try again.
              </p>
            ) : step === 'service' ? (
              <StepFrame
                n={index + 1}
                of={steps.length}
                title={checkIn ? 'What are we doing?' : 'Pick the services'}
                sub={
                  chair
                    ? `${chair.name}'s menu and prices.`
                    : 'Several are fine. Prices follow the barber.'
                }
              >
                {shown.length === 0 ? (
                  <p className="exq-flow__status" role="status">
                    {session === 'owner'
                      ? `${chair?.name ?? 'This chair'} has no services yet. Add some under Team, Services.`
                      : 'You have no services set up yet. Ask the owner to add them.'}
                  </p>
                ) : null}
                <ul className="exq-bare exq-flow__tiles">
                  {shown.map((s) => {
                    const p = priceOf(s);
                    const on = picked.serviceIds.includes(s.id);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="exq-flow__tile"
                          data-state={on ? 'selected' : 'idle'}
                          aria-pressed={on}
                          onClick={() => {
                            update({
                              serviceIds: on
                                ? picked.serviceIds.filter((id) => id !== s.id)
                                : [...picked.serviceIds, s.id],
                            });
                          }}
                        >
                          <span className="exq-flow__tile-name">{s.name}</span>
                          <span className="exq-flow__tile-sub">{p.durationMinutes} min</span>
                          <span className="exq-flow__tile-price exq-num">
                            {p.priceFrom ? 'From ' : ''}
                            {money(p.priceCents)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </StepFrame>
            ) : step === 'barber' ? (
              <StepFrame
                n={index + 1}
                of={steps.length}
                title="Who's cutting?"
                sub={
                  intent.kind === 'move'
                    ? "The booking takes the new barber's price and time."
                    : 'Each barber with their price and their wait right now.'
                }
              >
                <ul className="exq-bare exq-flow__tiles">
                  {intent.kind === 'new' ? (
                    <li>
                      <button
                        type="button"
                        className="exq-flow__tile"
                        data-state={picked.staffId === null ? 'selected' : 'idle'}
                        aria-pressed={picked.staffId === null}
                        onClick={() => {
                          update({ staffId: null });
                        }}
                      >
                        <span className="exq-flow__tile-name">First available</span>
                        <span className="exq-flow__tile-sub">
                          {firstFree ? `${firstFree.name} is free now` : 'Whoever frees up first'}
                        </span>
                        <span className="exq-flow__tile-price exq-num">
                          {chosen.length
                            ? `From ${money(quoteFirstAvailable(chosen, pool)?.totalCents ?? 0)}`
                            : ''}
                        </span>
                      </button>
                    </li>
                  ) : null}
                  {chairs.map((c) => {
                    const q = chosen.length
                      ? quoteForStaff(
                          chosen.map((s) => s),
                          c,
                        )
                      : null;
                    const offers = chosen.every((s) => c.serviceIds.includes(s.id));
                    const same = intent.kind === 'move' && c.id === intent.booking?.staff.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="exq-flow__tile"
                          data-state={picked.staffId === c.id ? 'selected' : 'idle'}
                          aria-pressed={picked.staffId === c.id}
                          disabled={!offers || same}
                          onClick={() => {
                            update({ staffId: c.id });
                          }}
                        >
                          <span className="exq-flow__tile-name">{c.name}</span>
                          <span className="exq-flow__tile-sub">
                            {same
                              ? 'Has it now'
                              : !offers
                                ? 'Does not do these services'
                                : chairLabel(chairEstimate(c.id))}
                          </span>
                          <span className="exq-flow__tile-price exq-num">
                            {q ? money(q.totalCents) : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </StepFrame>
            ) : step === 'time' ? (
              <StepFrame
                n={index + 1}
                of={steps.length}
                title="Pick a time"
                sub={`Now, or a time later. Only times ${chair?.name ?? 'the barber'} can do the full ${String(quote?.totalMinutes ?? 0)} minutes are shown.`}
              >
                {intent.kind === 'new' ? (
                  <button
                    type="button"
                    className="exq-flow__now"
                    data-state={
                      !nowAllowed ? 'closed' : picked.when === 'now' ? 'selected' : 'idle'
                    }
                    aria-pressed={picked.when === 'now'}
                    aria-disabled={!nowAllowed}
                    onClick={() => {
                      if (nowAllowed) update({ when: 'now' });
                    }}
                  >
                    <span className="exq-flow__now-icon" aria-hidden="true">
                      <Clock />
                    </span>
                    <span className="exq-flow__now-text">
                      <span className="exq-flow__now-title">Now</span>
                      <span className="exq-flow__now-sub">
                        {gate !== null && gate.kind !== 'open' ? gate.text : null}
                        {nowAllowed ? 'Walk-in, booked right this minute' : null}
                        {nowAllowed && estimates.now ? ` (${shopTime(estimates.now)})` : ''}
                        {nowAllowed ? '. ' : ''}
                        {!nowAllowed
                          ? ''
                          : nowEstimate.kind === 'free'
                            ? chair
                              ? `${chair.name} is free.`
                              : firstFree
                                ? `${firstFree.name} is free.`
                                : ''
                            : nowEstimate.kind === 'about'
                              ? `${chair?.name ?? 'Every chair'} is in a cut until about ${shopTime(nowEstimate.at)}, so they go next in ${chair ? 'the' : 'a'} line.`
                              : 'A free chair takes them, otherwise they join the line.'}
                      </span>
                    </span>
                    {nowAllowed ? (
                      <span className="exq-flow__now-chip exq-label">
                        {nowEstimate.kind === 'free'
                          ? 'Free now'
                          : nowEstimate.kind === 'about'
                            ? `Wait about ${String(nowEstimate.minutes)} min`
                            : 'Join the line'}
                      </span>
                    ) : (
                      <span className="exq-flow__now-chip exq-label" data-state="closed">
                        Not now
                      </span>
                    )}
                  </button>
                ) : null}
                {alternatives.length > 0 ? (
                  <div className="exq-flow__taken" role="alert">
                    <p>That time was just taken. The next open times:</p>
                    <ul className="exq-bare exq-flow__times">
                      {alternatives.map((a) => (
                        <li key={`${a.staffId}-${a.startAt}`}>
                          <button
                            type="button"
                            className="exq-flow__time"
                            onClick={() => {
                              setDay(shopParts(a.startAt).date);
                              update({ when: a.startAt });
                            }}
                          >
                            {shopDateTime(a.startAt)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="exq-label exq-flow__kicker">
                  {intent.kind === 'new' ? 'Or pick a day and time' : 'Pick a day and time'}
                </p>
                <DayPicker
                  serviceIds={picked.serviceIds}
                  staff={chair?.slug ?? FIRST}
                  selected={day}
                  version={tick}
                  onPick={(d) => {
                    setDay(d);
                  }}
                />
                <TimePicker
                  date={day}
                  serviceIds={picked.serviceIds}
                  staff={chair?.slug ?? FIRST}
                  selected={picked.when === 'now' ? null : picked.when}
                  version={tick}
                  onPick={(slot) => {
                    update({ when: slot.startAt });
                  }}
                />
              </StepFrame>
            ) : step === 'client' ? (
              <ClientStep
                session={session}
                checkIn={checkIn}
                n={index + 1}
                of={steps.length}
                picked={picked}
                onChange={update}
              />
            ) : step === 'confirm' ? (
              <StepFrame
                n={index + 1}
                of={steps.length}
                title={checkIn ? 'All set?' : 'Confirm'}
                sub="Nothing is booked until you confirm."
              >
                <dl className="exq-flow__summary">
                  <div>
                    <dt className="exq-label">Service</dt>
                    <dd>
                      {chosen.map((s) => s.name).join(', ') ||
                        intent.booking?.services.map((s) => s.name).join(', ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="exq-label">Barber</dt>
                    <dd>{chair?.name ?? 'First available'}</dd>
                  </div>
                  <div>
                    <dt className="exq-label">Time</dt>
                    <dd>
                      {picked.when === 'now' ? 'Now' : picked.when ? shopDateTime(picked.when) : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="exq-label">Client</dt>
                    <dd>
                      {picked.name}
                      {picked.email ? `, ${picked.email}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="exq-label">Total</dt>
                    <dd className="exq-num exq-flow__total">
                      {quote ? `${quote.from ? 'From ' : ''}${money(quote.totalCents)}` : ''}
                    </dd>
                  </div>
                </dl>
                {session === 'owner' && picked.when !== 'now' ? (
                  <label className="exq-flow__check">
                    <input
                      type="checkbox"
                      checked={picked.override}
                      onChange={(e) => {
                        update({ override: e.target.checked });
                      }}
                    />{' '}
                    Allow inside the lead time or past the booking window (audited)
                  </label>
                ) : null}
                {picked.when === 'now' && !picked.email ? (
                  <p className="exq-muted">No email goes out for a walk-in without an address.</p>
                ) : null}
              </StepFrame>
            ) : result ? (
              <div className="exq-flow__ticket" role="status">
                <p className="exq-label">{result.kind === 'line' ? 'In the line' : 'Booked'}</p>
                <h2 className="exq-flow__ticket-title">{result.text}</h2>
                <div className="exq-flow__ticket-actions">
                  <Button size="lg" onClick={onClose}>
                    Done
                  </Button>
                  {!checkIn ? (
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => {
                        const start = initial();
                        setPicked({
                          ...start.picked,
                          serviceIds: [],
                          when: null,
                          name: '',
                          phone: '',
                          email: '',
                          notes: '',
                        });
                        setStep('service');
                        setResult(null);
                        setDirty(false);
                        setKey(newIdempotencyKey());
                      }}
                    >
                      New booking
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {error && !(error instanceof ApiRequestError && error.code === 'SLOT_TAKEN') ? (
              <p className="exq-flow__error" role="alert">
                {error.message}
              </p>
            ) : null}
          </div>

          {step !== 'done' ? (
            <aside className="exq-flow__rail" aria-label="This booking">
              <p className="exq-flow__rail-title">This booking</p>
              <dl className="exq-flow__rail-rows">
                <RailRow
                  label="Service"
                  onChange={
                    step !== 'service' && intent.kind === 'new'
                      ? () => {
                          setStep('service');
                        }
                      : undefined
                  }
                >
                  {chosen.length
                    ? chosen.map((s) => s.name).join(', ')
                    : intent.booking
                      ? intent.booking.services.map((s) => s.name).join(', ')
                      : 'Not yet'}
                  {quote ? (
                    <span className="exq-flow__rail-sub">{quote.totalMinutes} min</span>
                  ) : null}
                </RailRow>
                {steps.some((s) => s.key === 'barber') ? (
                  <RailRow
                    label="Barber"
                    onChange={
                      step !== 'barber'
                        ? () => {
                            setStep('barber');
                          }
                        : undefined
                    }
                  >
                    {chair
                      ? chair.name
                      : picked.staffId === null &&
                          (step === 'time' || step === 'client' || step === 'confirm')
                        ? 'First available'
                        : 'Not yet'}
                  </RailRow>
                ) : fixedChair ? (
                  <RailRow label="Barber">{fixedChair.name}</RailRow>
                ) : null}
                {steps.some((s) => s.key === 'time') ? (
                  <RailRow
                    label="Time"
                    onChange={
                      step !== 'time'
                        ? () => {
                            setStep('time');
                          }
                        : undefined
                    }
                  >
                    {picked.when === 'now'
                      ? 'Now'
                      : picked.when
                        ? shopDateTime(picked.when)
                        : 'Not yet'}
                  </RailRow>
                ) : null}
              </dl>
              <p className="exq-flow__rail-total">
                <span className="exq-label">Total</span>
                <span className="exq-num">
                  {quote ? `${quote.from ? 'From ' : ''}${money(quote.totalCents)}` : '$0'}
                </span>
              </p>
              <div className="exq-flow__rail-actions">
                <Button
                  variant="outline"
                  size="lg"
                  disabled={index === 0 || working}
                  onClick={back}
                >
                  Back
                </Button>
                {step === 'confirm' ? (
                  <Button size="lg" loading={working} onClick={() => void confirm()}>
                    Confirm
                  </Button>
                ) : (
                  <Button size="lg" disabled={!canContinue() || !ready} onClick={next}>
                    Continue
                  </Button>
                )}
              </div>
              <p className="exq-flow__rail-note">
                Nothing is booked until you confirm on the last step.
              </p>
            </aside>
          ) : null}
        </div>
      </div>

      <Modal
        open={askDiscard}
        title="Discard this booking?"
        onClose={() => {
          setAskDiscard(false);
        }}
      >
        <p>Nothing has been booked yet. What you entered will be lost.</p>
        <div className="exq-flow__discard">
          <Button
            variant="outline"
            onClick={() => {
              setAskDiscard(false);
            }}
          >
            Keep going
          </Button>
          <Button
            variant="accent"
            onClick={() => {
              setAskDiscard(false);
              onClose();
            }}
          >
            Discard
          </Button>
        </div>
      </Modal>
    </Dialog>
  );
}

function chairLabel(e: WaitEstimateView): string {
  if (e.kind === 'free') return 'Free now';
  if (e.kind === 'about') return `Free about ${shopTime(e.at)}`;
  return 'Off today';
}

function StepFrame({
  n,
  of,
  title,
  sub,
  children,
}: {
  n: number;
  of: number;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <section className="exq-flow__step" aria-labelledby="exq-flow-step-title">
      <p className="exq-label exq-flow__kicker">
        Step {n} of {of}
      </p>
      <h3 id="exq-flow-step-title" className="exq-flow__title">
        {title}
      </h3>
      <p className="exq-flow__sub">{sub}</p>
      {children}
    </section>
  );
}

function RailRow({
  label,
  onChange,
  children,
}: {
  label: string;
  onChange?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <div className="exq-flow__rail-row">
      <dt className="exq-label">{label}</dt>
      <dd>
        {children}
        {onChange ? (
          <button type="button" className="exq-flow__change exq-label" onClick={onChange}>
            Change
          </button>
        ) : null}
      </dd>
    </div>
  );
}

function ClientStep({
  session,
  checkIn,
  n,
  of,
  picked,
  onChange,
}: {
  session: FlowSession;
  checkIn: boolean;
  n: number;
  of: number;
  picked: Picked;
  onChange: (patch: Partial<Picked>) => void;
}) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CustomerListResponse['rows']>([]);
  useEffect(() => {
    if (session !== 'owner' || checkIn || query.trim().length < 2) {
      setRows([]);
      return;
    }
    let gone = false;
    const id = window.setTimeout(() => {
      apiRequest(
        `/api/admin/customer-list?q=${encodeURIComponent(query.trim())}`,
        customerListResponseSchema,
      )
        .then((d) => {
          if (!gone) setRows(d.rows.slice(0, 6));
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      gone = true;
      window.clearTimeout(id);
    };
  }, [query, session, checkIn]);
  return (
    <StepFrame
      n={n}
      of={of}
      title={checkIn ? "Who's this for?" : 'Who is it for?'}
      sub={
        checkIn
          ? 'Your name and mobile, so we can call you up.'
          : 'Find a client or enter a new one. Name and phone are required.'
      }
    >
      {session === 'owner' && !checkIn ? (
        <div className="exq-flow__search">
          <Input
            label="Find a client"
            placeholder="Name or phone"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
          {rows.length > 0 ? (
            <ul className="exq-bare exq-flow__matches" aria-label="Matching clients">
              {rows.map((r) => (
                <li key={r.phoneE164}>
                  <button
                    type="button"
                    className="exq-flow__match"
                    onClick={() => {
                      onChange({ name: r.name, phone: r.phoneE164 });
                      setQuery('');
                    }}
                  >
                    <span>{r.name}</span>
                    <span className="exq-flow__match-sub">
                      {r.phone}
                      {r.usualBarber ? `, usually ${r.usualBarber}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="exq-flow__form">
        <Input
          label="Name"
          required
          autoComplete="off"
          value={picked.name}
          onChange={(e) => {
            onChange({ name: e.target.value });
          }}
        />
        <Input
          label="Mobile phone"
          type="tel"
          inputMode="tel"
          required
          autoComplete="off"
          value={picked.phone}
          onChange={(e) => {
            onChange({ phone: e.target.value });
          }}
        />
        {!checkIn ? (
          <>
            <Input
              label="Email (optional)"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={picked.email}
              onChange={(e) => {
                onChange({ email: e.target.value });
              }}
            />
            <Textarea
              label="Notes (optional)"
              rows={2}
              maxLength={500}
              value={picked.notes}
              onChange={(e) => {
                onChange({ notes: e.target.value });
              }}
            />
          </>
        ) : null}
      </div>
    </StepFrame>
  );
}
