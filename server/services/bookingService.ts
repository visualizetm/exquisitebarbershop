import type { ClientSession } from 'mongodb';
import type { ManualBookingInput, ManualBookingResponse } from '../../shared/api/admin';
import type { AvailabilitySlot } from '../../shared/api/availability';
import type {
  CreateBookingInput,
  CreateBookingResponse,
  ManageBookingResponse,
  RescheduleBookingResponse,
} from '../../shared/api/bookings';
import { generateReferenceCode } from '../../shared/lib/referenceCode';
import type { PriceQuote } from '../../shared/lib/servicePricing';
import { addMinutes, minutesBetween, shopDateOf, shopDayStart } from '../../shared/lib/time';
import type { BookingCustomer, BookingDocument, BookingSource } from '../../shared/schemas/booking';
import type { ServiceDocument } from '../../shared/schemas/service';
import type { BookingSettings, ShopSettingsDocument } from '../../shared/schemas/shopSettings';
import type { StaffDocument } from '../../shared/schemas/staff';
import type { Actor } from '../../shared/schemas/timeBlock';
import { withTransaction } from '../db/transaction';
import { getEnv } from '../env';
import { AppError } from '../lib/errors';
import { sha256Hex } from '../lib/ids';
import { createManageToken, managePath, verifyManageToken } from '../lib/manageToken';
import { stableStringify } from '../lib/objects';
import {
  auditLogRepo,
  bookingsRepo,
  idempotencyKeysRepo,
  rateLimitsRepo,
  scheduleGuardsRepo,
  shopSettingsRepo,
  slotLocksRepo,
  staffRepo,
} from '../repos';
import { LaunchOfferTaken, ReferenceCodeCollision } from '../repos/bookingsRepo';
import { launchOfferDiscount } from '../../shared/lib/launchOffer';
import {
  computeAvailability,
  findSlot,
  isOnSlotGrid,
  isWithinWorkingTime,
  nextOpenSlots,
  quoteStaff,
  resolveStaffSelector,
  type AvailabilityContext,
  type AvailabilityResult,
  type OpenSlot,
} from './availability';
import { loadAvailabilityContext } from './availabilityData';
import { enqueueBookingNotifications } from './bookingNotifications';
import { toAdminBookingView, toBookingView } from './bookingView';
import { relockBlocks } from './locks';

/** Grace period a manage link stays valid after the appointment ends. */
export const MANAGE_LINK_GRACE_DAYS = 7;
/** Days of availability loaded around a request, so SLOT_TAKEN can offer alternatives. */
const ALTERNATIVE_DAYS = 3;
const ALTERNATIVE_LIMIT = 5;
const MAX_ATTEMPTS = 6;
/** How far ahead the owner may book by phone with the override on. */
const OVERRIDE_WINDOW_DAYS = 365;

export interface BookingLimits {
  ipPer10Minutes: number;
  phonePerDay: number;
  manageIpPer10Minutes: number;
}
export const DEFAULT_LIMITS: BookingLimits = {
  ipPer10Minutes: 10,
  phonePerDay: 5,
  manageIpPer10Minutes: 30,
};

export interface RequestMeta {
  ip: string;
  requestId: string;
  now: Date;
  limits?: Partial<BookingLimits>;
}

export interface BookingOutcome<T> {
  status: number;
  body: T;
  /** Outbox rows written by this call; the route delivers them after responding. */
  outboxIds: string[];
  /** True when the response was replayed from an idempotency record. */
  replayed: boolean;
}

const CUSTOMER: Actor = { type: 'customer', userId: null, staffId: null };

export function manageLinkFor(booking: BookingDocument): string {
  const token = createManageToken(getEnv().MANAGE_LINK_SECRET, {
    bookingId: booking._id,
    version: booking.manageTokenVersion,
    expiresAt: addMinutes(booking.endAt, MANAGE_LINK_GRACE_DAYS * 24 * 60),
  });
  return managePath(token);
}

function toApiSlot(slot: OpenSlot): AvailabilitySlot {
  return {
    startAt: slot.startAt.toISOString(),
    endAt: slot.endAt.toISOString(),
    staffId: slot.staffId,
  };
}

function reasonError(
  result: AvailabilityResult,
  startAt: Date,
  ctx: AvailabilityContext,
): AppError {
  // Too soon is reported as such even when later times that day are open.
  if (startAt.getTime() < addMinutes(ctx.now, ctx.settings.leadTimeMinutes).getTime()) {
    return new AppError('OUTSIDE_BOOKING_WINDOW', 'That time is too soon to book online');
  }
  const day = result.days.find((d) => d.date === shopDateOf(startAt));
  switch (day?.reason) {
    case 'closed':
      return new AppError('SHOP_CLOSED', 'The shop is closed at that time');
    case 'outsideWindow':
      return new AppError('OUTSIDE_BOOKING_WINDOW', 'That time cannot be booked online');
    case 'dayOff':
    case 'noQualifiedStaff':
      return new AppError(
        'STAFF_UNAVAILABLE',
        'Nobody is available for those services at that time',
      );
    case 'fullyBooked':
    case null:
    case undefined:
      return new AppError('SLOT_TAKEN', 'That time is no longer available');
  }
}

/** Booking settings with lead time and the window lifted, for owner overrides. */
function relaxed(settings: BookingSettings): BookingSettings {
  return { ...settings, leadTimeMinutes: 0, bookingWindowDays: OVERRIDE_WINDOW_DAYS };
}

async function alternativesAfter(
  input: {
    serviceIds: string[];
    staff: string;
    startAt: Date;
    excludeBookingId?: string;
    keep?: { staffId: string; serviceMinutes: number };
    override?: boolean;
  },
  now: Date,
): Promise<AvailabilitySlot[]> {
  const fromDate = shopDateOf(input.startAt);
  const toDate =
    shopDayStart(fromDate)
      .plus({ days: ALTERNATIVE_DAYS - 1 })
      .toISODate() ?? fromDate;
  const loaded = await loadAvailabilityContext({
    fromDate,
    toDate,
    serviceIds: input.serviceIds,
    now,
  });
  const ctx = input.override ? { ...loaded, settings: relaxed(loaded.settings) } : loaded;
  const request = {
    fromDate,
    toDate,
    staff: input.staff,
    ...(input.excludeBookingId ? { excludeBookingId: input.excludeBookingId } : {}),
    ...(input.keep ? { keep: input.keep } : {}),
  };
  const result = computeAvailability(request, ctx);
  return nextOpenSlots(result, input.startAt, ALTERNATIVE_LIMIT).map(toApiSlot);
}

async function slotTakenWithAlternatives(
  input: {
    serviceIds: string[];
    staff: string;
    startAt: Date;
    excludeBookingId?: string;
    keep?: { staffId: string; serviceMinutes: number };
    override?: boolean;
  },
  now: Date,
  cause: unknown,
): Promise<AppError> {
  const alternatives = await alternativesAfter(input, now).catch(() => [] as AvailabilitySlot[]);
  return new AppError('SLOT_TAKEN', 'That time was just taken. Here are the next open times.', {
    extra: { alternatives },
    cause,
  });
}

/** A fresh reference code that is not in use. The unique index still guards the race. */
async function freshReferenceCode(): Promise<string> {
  for (let i = 0; i < 5; i += 1) {
    const code = generateReferenceCode();
    if (!(await bookingsRepo.findBookingByReferenceCode(code))) return code;
  }
  throw new AppError('INTERNAL_ERROR', 'Could not allocate a reference code');
}

async function enforceRateLimits(
  input: { ip: string; phone: string },
  limits: BookingLimits,
  now: Date,
): Promise<void> {
  const ip = await rateLimitsRepo.hitRateLimit(
    `booking:ip:${input.ip}`,
    { limit: limits.ipPer10Minutes, windowMs: 10 * 60_000 },
    now,
  );
  if (!ip.allowed) {
    throw new AppError(
      'RATE_LIMITED',
      'Too many booking attempts. Please try again in a few minutes.',
      {
        retryAfterSeconds: ip.retryAfterSeconds,
      },
    );
  }
  const phone = await rateLimitsRepo.hitRateLimit(
    `booking:phone:${input.phone}`,
    { limit: limits.phonePerDay, windowMs: 24 * 60 * 60_000 },
    now,
  );
  if (!phone.allowed) {
    throw new AppError('RATE_LIMITED', 'Too many bookings for this phone number today.', {
      retryAfterSeconds: phone.retryAfterSeconds,
    });
  }
}

function parseStart(iso: string, settings?: BookingSettings): Date {
  const startAt = new Date(iso);
  if (Number.isNaN(startAt.getTime())) {
    throw new AppError('VALIDATION_ERROR', 'Invalid start time', {
      details: [{ path: 'startAt', message: 'Invalid date' }],
    });
  }
  if (settings && !isOnSlotGrid(startAt, settings)) {
    throw new AppError('VALIDATION_ERROR', 'Start time must be on the booking grid', {
      details: [
        { path: 'startAt', message: `Start on a ${settings.slotStepMinutes} minute boundary` },
      ],
    });
  }
  return startAt;
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

interface IdempotencyHandle<T> {
  scope: string;
  key: string;
  /** Builds the stored response inside the transaction that commits the booking. */
  respond: (placed: PlacedBooking) => T;
}

/**
 * Claims an Idempotency-Key, runs the work, and releases the key if the work
 * fails so the client may retry with it. The work completes the key inside its
 * own transaction, so a committed booking always has a stored response.
 */
async function withIdempotency<T>(
  scope: string,
  key: string,
  body: unknown,
  now: Date,
  work: () => Promise<BookingOutcome<T>>,
): Promise<BookingOutcome<T>> {
  const requestHash = sha256Hex(stableStringify(body));
  const claim = await idempotencyKeysRepo.beginIdempotencyKey(scope, key, requestHash, now);
  if (claim.state === 'completed') {
    return {
      status: claim.response.status,
      body: claim.response.body as T,
      outboxIds: [],
      replayed: true,
    };
  }
  if (claim.state === 'inProgress') {
    throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'That request is still being processed');
  }
  if (claim.state === 'mismatch') {
    throw new AppError(
      'IDEMPOTENCY_BODY_MISMATCH',
      'This Idempotency-Key was already used with a different request',
    );
  }
  try {
    return await work();
  } catch (error) {
    await idempotencyKeysRepo.releaseIdempotencyKey(scope, key);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Placing bookings
// ---------------------------------------------------------------------------

/** Who is booking and which rules apply. */
interface PlacementPolicy {
  source: Extract<BookingSource, 'online' | 'phone'>;
  actor: Actor;
  /** Ignore lead time and the booking window (owner phone bookings). Never ignores locks. */
  override: boolean;
  /** Apply the open-bookings-per-phone cap (online only). */
  enforcePhoneCap: boolean;
  audience: { customer: boolean; owner: boolean };
  /** Owner-made bookings are already seen. */
  ownerSeenAt: Date | null;
  /** The launch offer is only for public online bookings; a staff-made booking never gets it. */
  offerAllowed: boolean;
}

const ONLINE_POLICY: PlacementPolicy = {
  source: 'online',
  actor: CUSTOMER,
  override: false,
  enforcePhoneCap: true,
  audience: { customer: true, owner: true },
  ownerSeenAt: null,
  offerAllowed: true,
};

interface PlacementInput {
  serviceIds: string[];
  staff: string;
  customer: BookingCustomer;
  notes?: string | undefined;
}

interface PlacedBooking {
  booking: BookingDocument;
  staff: StaffDocument;
  settings: ShopSettingsDocument;
  outboxIds: string[];
  /** The time was only bookable because of the owner override. */
  overrideUsed: boolean;
  /** Walk-ins: the services sit outside the chair's working time. */
  outsideWorkingTime: boolean;
}

/**
 * The services as the booking will keep them: the name and group of the service, and the price and
 * time of the chair it was booked on. They are copied, so later price edits never touch a booking.
 * A booking always has one chair, so its prices are exact, never "from".
 */
function serviceSnapshots(
  services: readonly ServiceDocument[],
  quote: PriceQuote,
): BookingDocument['services'] {
  return services.map((s) => {
    const line = quote.lines.find((l) => l.serviceId === s._id);
    return {
      serviceId: s._id,
      name: s.name,
      group: s.group,
      priceCents: line?.priceCents ?? s.priceCents,
      priceFrom: false,
      durationMinutes: line?.durationMinutes ?? s.durationMinutes,
    };
  });
}

function cleanNotes(notes: string | undefined): string | null {
  return notes?.trim() ? notes.trim() : null;
}

/**
 * One attempt to place a booking on one chair, inside one transaction. The lock
 * insert is the arbiter: a duplicate aborts the whole transaction, which is why a
 * conflict surfaces as SLOT_TAKEN and the caller starts a new attempt.
 */
async function placeBooking(
  input: PlacementInput,
  startAt: Date,
  tried: ReadonlySet<string>,
  referenceCode: string,
  meta: RequestMeta,
  policy: PlacementPolicy,
  idempotency: IdempotencyHandle<unknown> | null,
  session: ClientSession,
): Promise<PlacedBooking> {
  const date = shopDateOf(startAt);
  const strict = await loadAvailabilityContext(
    { fromDate: date, toDate: date, serviceIds: input.serviceIds, now: meta.now },
    session,
  );
  const ctx = policy.override ? { ...strict, settings: relaxed(strict.settings) } : strict;
  const settings = await shopSettingsRepo.requireShopSettings({ session });
  const result = computeAvailability({ fromDate: date, toDate: date, staff: input.staff }, ctx);
  const slot = findSlot(result, startAt);
  if (!slot) throw reasonError(result, startAt, ctx);
  const staffId = slot.candidates.find((id) => !tried.has(id));
  if (!staffId) throw new AppError('SLOT_TAKEN', 'That time is no longer available');
  const staff = result.staff.find((s) => s._id === staffId);
  const quote = staff ? result.quotes.get(staff._id) : undefined;
  if (!staff || !quote) throw new AppError('SLOT_TAKEN', 'That time is no longer available');
  const overrideUsed =
    policy.override &&
    findSlot(
      computeAvailability({ fromDate: date, toDate: date, staff: input.staff }, strict),
      startAt,
    ) === null;

  // Serialises with any schedule change for this chair committing at the same time.
  await scheduleGuardsRepo.bumpScheduleGuards([staff._id], meta.now, { session });

  if (policy.enforcePhoneCap) {
    const open = await bookingsRepo.countOpenBookingsForPhone(input.customer.phone, meta.now, {
      session,
    });
    if (open >= settings.booking.maxOpenBookingsPerPhone) {
      throw new AppError(
        'TOO_MANY_OPEN_BOOKINGS',
        'This phone number already has the maximum number of upcoming bookings',
      );
    }
  }

  // The launch offer, decided here inside the transaction so two first bookings for one phone can
  // never both carry it (the unique partial index is the last line; placeWithFallback retries
  // without the offer when it fires).
  const discount = policy.offerAllowed
    ? launchOfferDiscount(settings.launchOffer, {
        source: policy.source,
        priceCents: quote.price.totalCents,
        shopDate: shopDateOf(meta.now),
        alreadyUsed: await bookingsRepo.launchOfferUsedByPhone(input.customer.phone, { session }),
      })
    : null;

  // Price and time are the assigned chair's own, also when "first available" picked the chair.
  const endAt = addMinutes(startAt, quote.serviceMinutes);
  const booking = await bookingsRepo.insertBooking(
    {
      referenceCode,
      staffId: staff._id,
      staffRequested: input.staff !== 'any',
      services: serviceSnapshots(ctx.services, quote.price),
      startAt,
      endAt,
      durationMinutes: quote.serviceMinutes,
      bufferMinutes: quote.bufferMinutes,
      totalPriceCents: quote.price.totalCents,
      discounts: discount ? [discount] : [],
      customer: input.customer,
      status: 'confirmed',
      source: policy.source,
      notes: cleanNotes(input.notes),
      cancellation: null,
      rescheduledFromId: null,
      manageTokenVersion: 1,
      ownerSeenAt: policy.ownerSeenAt,
    },
    meta.now,
    { session },
  );
  await slotLocksRepo.acquireSlotLocks(
    staff._id,
    { start: startAt, end: addMinutes(endAt, quote.bufferMinutes) },
    { holderType: 'booking', holderId: booking._id },
    meta.now,
    { session },
  );
  await auditLogRepo.appendAuditEntry(
    {
      actor: policy.actor,
      action: 'booking.create',
      entityType: 'booking',
      entityId: booking._id,
      before: null,
      after: {
        status: booking.status,
        staffId: booking.staffId,
        startAt: booking.startAt,
        endAt: booking.endAt,
      },
      meta: {
        source: policy.source,
        staffRequested: booking.staffRequested,
        ip: meta.ip,
        ...(policy.override ? { override: true, overrideUsed } : {}),
      },
      requestId: meta.requestId,
    },
    meta.now,
    { session },
  );
  const outboxIds = await enqueueBookingNotifications(
    {
      event: 'confirmed',
      view: toBookingView(booking, staff),
      settings,
      managePath: manageLinkFor(booking),
      previousStartAt: null,
      cancelReason: null,
      audience: policy.audience,
    },
    meta.now,
    session,
  );
  const placed: PlacedBooking = {
    booking,
    staff,
    settings,
    outboxIds,
    overrideUsed,
    outsideWorkingTime: false,
  };
  if (idempotency) {
    await idempotencyKeysRepo.completeIdempotencyKey(
      idempotency.scope,
      idempotency.key,
      { status: 201, body: idempotency.respond(placed) },
      { session },
    );
  }
  return placed;
}

/** Loops over chairs for "first available", one transaction per attempt. */
async function placeWithFallback(
  input: PlacementInput,
  startAt: Date,
  meta: RequestMeta,
  policy: PlacementPolicy,
  idempotency: IdempotencyHandle<unknown> | null,
): Promise<PlacedBooking> {
  const tried = new Set<string>();
  let lastConflict: unknown = null;
  let effective = policy;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const referenceCode = await freshReferenceCode();
    try {
      return await withTransaction((session) =>
        placeBooking(input, startAt, tried, referenceCode, meta, effective, idempotency, session),
      );
    } catch (error) {
      if (error instanceof ReferenceCodeCollision) continue;
      if (error instanceof LaunchOfferTaken) {
        // Another booking for this phone won the offer a moment ago: place this one without it.
        effective = { ...effective, offerAllowed: false };
        continue;
      }
      if (error instanceof AppError && error.code === 'SLOT_TAKEN') {
        lastConflict = error;
        // The lock error names the chair that conflicted; try the next qualified one.
        const staffId = typeof error.context?.staffId === 'string' ? error.context.staffId : null;
        if (input.staff !== 'any' || !staffId) break;
        tried.add(staffId);
        continue;
      }
      throw error;
    }
  }
  throw await slotTakenWithAlternatives(
    { serviceIds: input.serviceIds, staff: input.staff, startAt, override: policy.override },
    meta.now,
    lastConflict,
  );
}

export async function createBooking(
  input: CreateBookingInput,
  meta: RequestMeta & { idempotencyKey: string },
): Promise<BookingOutcome<CreateBookingResponse>> {
  if (input.website && input.website.trim() !== '') {
    throw new AppError('BAD_REQUEST', 'Request rejected');
  }
  const limits = { ...DEFAULT_LIMITS, ...meta.limits };
  const settings = await shopSettingsRepo.requireShopSettings();
  const startAt = parseStart(input.startAt, settings.booking);
  const { website: _website, ...hashed } = input;
  const scope = 'bookings.create';
  return withIdempotency(scope, meta.idempotencyKey, hashed, meta.now, async () => {
    await enforceRateLimits({ ip: meta.ip, phone: input.customer.phone }, limits, meta.now);
    const respond = (p: PlacedBooking): CreateBookingResponse => ({
      booking: toBookingView(p.booking, p.staff),
      managePath: manageLinkFor(p.booking),
    });
    const placed = await placeWithFallback(input, startAt, meta, ONLINE_POLICY, {
      scope,
      key: meta.idempotencyKey,
      respond,
    });
    return { status: 201, body: respond(placed), outboxIds: placed.outboxIds, replayed: false };
  });
}

// ---------------------------------------------------------------------------
// Owner bookings: phone and walk-in
// ---------------------------------------------------------------------------

/**
 * A walk-in: starts now or at a given time today, skips the availability rules
 * (the customer is standing in the shop) but still takes slot locks, so it can
 * never overlap a booking or blocked time and online booking cannot land on it.
 */
async function placeWalkIn(
  input: PlacementInput & { notifyCustomer: boolean; arrived?: boolean | undefined },
  startAt: Date,
  referenceCode: string,
  meta: RequestMeta,
  actor: Actor,
  idempotency: IdempotencyHandle<unknown>,
  session: ClientSession,
): Promise<PlacedBooking> {
  const date = shopDateOf(startAt);
  const ctx = await loadAvailabilityContext(
    { fromDate: date, toDate: date, serviceIds: input.serviceIds, now: meta.now },
    session,
  );
  const settings = await shopSettingsRepo.requireShopSettings({ session });
  const staff = resolveStaffSelector(ctx.staff, input.staff);
  // A missing chair reads as undefined, which is not null, so it is refused too.
  if (staff?.deletedAt !== null)
    throw new AppError('STAFF_UNAVAILABLE', 'That chair was not found');
  const quote = quoteStaff(staff, ctx.services, ctx.settings);
  if (!quote) {
    throw new AppError('STAFF_UNAVAILABLE', `${staff.name} does not offer every chosen service`);
  }
  await scheduleGuardsRepo.bumpScheduleGuards([staff._id], meta.now, { session });

  const { serviceMinutes, bufferMinutes } = quote;
  const endAt = addMinutes(startAt, serviceMinutes);
  const outsideWorkingTime = !isWithinWorkingTime(
    { staffId: staff._id, startAt, endAt },
    staff,
    ctx,
  );
  const booking = await bookingsRepo.insertBooking(
    {
      referenceCode,
      staffId: staff._id,
      staffRequested: true,
      services: serviceSnapshots(ctx.services, quote.price),
      startAt,
      endAt,
      durationMinutes: serviceMinutes,
      bufferMinutes,
      totalPriceCents: quote.price.totalCents,
      customer: input.customer,
      status: 'confirmed',
      source: 'walkIn',
      notes: cleanNotes(input.notes),
      cancellation: null,
      rescheduledFromId: null,
      manageTokenVersion: 1,
      ownerSeenAt: meta.now,
      arrivedAt: input.arrived ? meta.now : null,
    },
    meta.now,
    { session },
  );
  try {
    await slotLocksRepo.acquireSlotLocks(
      staff._id,
      { start: startAt, end: addMinutes(endAt, bufferMinutes) },
      { holderType: 'booking', holderId: booking._id },
      meta.now,
      { session },
    );
  } catch (error) {
    if (error instanceof AppError && error.code === 'SLOT_TAKEN') {
      throw new AppError('SLOT_TAKEN', `${staff.name} is already booked or blocked at that time`, {
        cause: error,
      });
    }
    throw error;
  }
  await auditLogRepo.appendAuditEntry(
    {
      actor,
      action: 'booking.create',
      entityType: 'booking',
      entityId: booking._id,
      before: null,
      after: {
        status: booking.status,
        staffId: booking.staffId,
        startAt: booking.startAt,
        endAt: booking.endAt,
      },
      meta: { source: 'walkIn', outsideWorkingTime, ip: meta.ip },
      requestId: meta.requestId,
    },
    meta.now,
    { session },
  );
  const outboxIds = await enqueueBookingNotifications(
    {
      event: 'confirmed',
      view: toBookingView(booking, staff),
      settings,
      managePath: manageLinkFor(booking),
      previousStartAt: null,
      cancelReason: null,
      audience: { customer: input.notifyCustomer, owner: false },
    },
    meta.now,
    session,
  );
  const placed: PlacedBooking = {
    booking,
    staff,
    settings,
    outboxIds,
    overrideUsed: false,
    outsideWorkingTime,
  };
  await idempotencyKeysRepo.completeIdempotencyKey(
    idempotency.scope,
    idempotency.key,
    { status: 201, body: idempotency.respond(placed) },
    { session },
  );
  return placed;
}

/** Walk-in start: now (to the minute) or a time today, in shop time. */
function walkInStart(iso: string | undefined, now: Date): Date {
  const startAt = iso ? new Date(iso) : new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  if (Number.isNaN(startAt.getTime()) || shopDateOf(startAt) !== shopDateOf(now)) {
    throw new AppError('VALIDATION_ERROR', 'Walk-ins start today', {
      details: [{ path: 'startAt', message: 'Choose a time today' }],
    });
  }
  return startAt;
}

/**
 * Bookings the owner enters: phone bookings follow normal availability (with an
 * optional, audited override of lead time and the window) and walk-ins take a
 * chair now. Neither may ever take a slot someone else holds.
 */
export async function createManualBooking(
  input: ManualBookingInput,
  actor: Actor,
  meta: RequestMeta & { idempotencyKey: string },
): Promise<BookingOutcome<ManualBookingResponse>> {
  const settings = await shopSettingsRepo.requireShopSettings();
  const scope = 'admin.bookings.create';
  const respond = (p: PlacedBooking): ManualBookingResponse => ({
    booking: toAdminBookingView(p.booking, p.staff),
    managePath: manageLinkFor(p.booking),
    overrideUsed: p.overrideUsed,
    outsideWorkingTime: p.outsideWorkingTime,
  });
  const notifyCustomer = input.notifyCustomer ?? input.source === 'phone';
  return withIdempotency(scope, meta.idempotencyKey, input, meta.now, async () => {
    let placed: PlacedBooking;
    if (input.source === 'walkIn') {
      const startAt = walkInStart(input.startAt, meta.now);
      placed = await placeWalkInWithRetry({ ...input, notifyCustomer }, startAt, meta, actor, {
        scope,
        key: meta.idempotencyKey,
        respond,
      });
    } else {
      const startAt = parseStart(input.startAt ?? '', settings.booking);
      placed = await placeWithFallback(
        input,
        startAt,
        meta,
        {
          source: 'phone',
          actor,
          override: input.override,
          enforcePhoneCap: false,
          offerAllowed: false,
          audience: { customer: notifyCustomer, owner: false },
          ownerSeenAt: meta.now,
        },
        { scope, key: meta.idempotencyKey, respond },
      );
    }
    return { status: 201, body: respond(placed), outboxIds: placed.outboxIds, replayed: false };
  });
}

async function placeWalkInWithRetry(
  input: PlacementInput & { notifyCustomer: boolean; arrived?: boolean | undefined },
  startAt: Date,
  meta: RequestMeta,
  actor: Actor,
  idempotency: IdempotencyHandle<unknown>,
): Promise<PlacedBooking> {
  for (let attempt = 0; ; attempt += 1) {
    const referenceCode = await freshReferenceCode();
    try {
      return await withTransaction((session) =>
        placeWalkIn(input, startAt, referenceCode, meta, actor, idempotency, session),
      );
    } catch (error) {
      if (error instanceof ReferenceCodeCollision && attempt < MAX_ATTEMPTS) continue;
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Cancel and reschedule cores, shared by the manage link and the owner
// ---------------------------------------------------------------------------

export interface CancelPolicy {
  actor: Actor;
  reason: string | null;
  audience: { customer: boolean; owner: boolean };
  requestId: string | null;
  ip?: string;
}

/**
 * Cancels inside the caller's transaction: status, every lock released (blocked
 * time that shared those slots takes them back), audit entry, notifications.
 */
export async function cancelInTransaction(
  booking: BookingDocument,
  staff: Pick<StaffDocument, '_id' | 'name' | 'slug'>,
  settings: ShopSettingsDocument,
  policy: CancelPolicy,
  now: Date,
  session: ClientSession,
): Promise<{ cancelled: BookingDocument; outboxIds: string[] }> {
  const cancelled = await bookingsRepo.cancelBooking(
    booking._id,
    { at: now, by: policy.actor.type, reason: policy.reason },
    now,
    { session },
  );
  await slotLocksRepo.releaseSlotLocks(cancelled._id, { session });
  await relockBlocks(
    booking.staffId,
    { start: booking.startAt, end: addMinutes(booking.endAt, booking.bufferMinutes) },
    now,
    session,
  );
  await auditLogRepo.appendAuditEntry(
    {
      actor: policy.actor,
      action: 'booking.cancel',
      entityType: 'booking',
      entityId: cancelled._id,
      before: { status: 'confirmed' },
      after: { status: 'cancelled' },
      meta: {
        reason: policy.reason,
        notifyCustomer: policy.audience.customer,
        ...(policy.ip ? { ip: policy.ip } : {}),
      },
      requestId: policy.requestId,
    },
    now,
    { session },
  );
  const outboxIds = await enqueueBookingNotifications(
    {
      event: 'cancelled',
      view: toBookingView(cancelled, staff),
      settings,
      managePath: null,
      previousStartAt: null,
      cancelReason: policy.reason,
      audience: policy.audience,
    },
    now,
    session,
  );
  return { cancelled, outboxIds };
}

export interface ReschedulePolicy {
  actor: Actor;
  /** Ignore lead time and the booking window. Never ignores locks. */
  override: boolean;
  audience: { customer: boolean; owner: boolean };
  requestId: string;
  ip?: string;
}

export interface Rescheduled {
  moved: BookingDocument;
  staff: StaffDocument;
  outboxIds: string[];
}

/**
 * Moves a confirmed booking. Each attempt is one transaction that releases the
 * old locks, takes the new ones and updates the booking, so moving into an
 * overlapping time on the same chair works. "any" falls through to the next
 * free chair on a lock conflict, like a new booking.
 */
export async function rescheduleBookingAs(
  booking: BookingDocument,
  settings: ShopSettingsDocument,
  input: { startAt: Date; selector: string },
  policy: ReschedulePolicy,
  now: Date,
): Promise<Rescheduled> {
  const { startAt, selector } = input;
  const serviceIds = booking.services.map((s) => s.serviceId);
  const keep = { staffId: booking.staffId, serviceMinutes: booking.durationMinutes };
  const tried = new Set<string>();
  let lastConflict: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await withTransaction(async (session) => {
        const date = shopDateOf(startAt);
        const strict = await loadAvailabilityContext(
          { fromDate: date, toDate: date, serviceIds, now },
          session,
        );
        const ctx = policy.override ? { ...strict, settings: relaxed(strict.settings) } : strict;
        const result = computeAvailability(
          {
            fromDate: date,
            toDate: date,
            staff: selector,
            excludeBookingId: booking._id,
            keep,
          },
          ctx,
        );
        const slot = findSlot(result, startAt);
        if (!slot) throw reasonError(result, startAt, ctx);
        const staffId = slot.candidates.find((id) => !tried.has(id));
        const staff = staffId ? result.staff.find((s) => s._id === staffId) : undefined;
        const quote = staffId ? result.quotes.get(staffId) : undefined;
        if (!staffId || !staff || !quote)
          throw new AppError('SLOT_TAKEN', 'That time is no longer available');
        await scheduleGuardsRepo.bumpScheduleGuards([staff._id], now, { session });

        // The same chair keeps the length it was booked with. A different chair has its own price
        // and time for these services, so the booking takes that chair's from here on.
        const sameChair = staff._id === booking.staffId;
        const endAt = addMinutes(startAt, quote.serviceMinutes);
        // Release first so moving within the same chair's current window works.
        await slotLocksRepo.releaseSlotLocks(booking._id, { session });
        await slotLocksRepo.acquireSlotLocks(
          staff._id,
          { start: startAt, end: addMinutes(endAt, quote.bufferMinutes) },
          { holderType: 'booking', holderId: booking._id },
          now,
          { session },
        );
        await relockBlocks(
          booking.staffId,
          { start: booking.startAt, end: addMinutes(booking.endAt, booking.bufferMinutes) },
          now,
          session,
        );
        const moved = await bookingsRepo.rescheduleBooking(
          booking._id,
          {
            staffId: staff._id,
            staffRequested: selector !== 'any',
            startAt,
            endAt,
            bufferMinutes: quote.bufferMinutes,
            ...(sameChair
              ? {}
              : {
                  services: serviceSnapshots(ctx.services, quote.price),
                  durationMinutes: quote.serviceMinutes,
                  totalPriceCents: quote.price.totalCents,
                }),
          },
          now,
          { session },
        );
        await auditLogRepo.appendAuditEntry(
          {
            actor: policy.actor,
            action: 'booking.reschedule',
            entityType: 'booking',
            entityId: moved._id,
            before: { staffId: booking.staffId, startAt: booking.startAt, endAt: booking.endAt },
            after: { staffId: moved.staffId, startAt: moved.startAt, endAt: moved.endAt },
            meta: {
              notifyCustomer: policy.audience.customer,
              ...(policy.ip ? { ip: policy.ip } : {}),
              ...(policy.override ? { override: true } : {}),
            },
            requestId: policy.requestId,
          },
          now,
          { session },
        );
        const outboxIds = await enqueueBookingNotifications(
          {
            event: 'rescheduled',
            view: toBookingView(moved, staff),
            settings,
            managePath: manageLinkFor(moved),
            previousStartAt: booking.startAt,
            cancelReason: null,
            audience: policy.audience,
          },
          now,
          session,
        );
        return { moved, staff, outboxIds };
      });
    } catch (error) {
      if (error instanceof AppError && error.code === 'SLOT_TAKEN') {
        lastConflict = error;
        const staffId = typeof error.context?.staffId === 'string' ? error.context.staffId : null;
        if (selector !== 'any' || !staffId) break;
        tried.add(staffId);
        continue;
      }
      throw error;
    }
  }
  throw await slotTakenWithAlternatives(
    {
      serviceIds,
      staff: selector,
      startAt,
      excludeBookingId: booking._id,
      keep,
      override: policy.override,
    },
    now,
    lastConflict,
  );
}

/** Validates a new start for a reschedule and rejects a move to the same time and chair. */
export function rescheduleStart(
  booking: BookingDocument,
  iso: string,
  selector: string | undefined,
  settings: BookingSettings,
): Date {
  const startAt = parseStart(iso, settings);
  if (
    startAt.getTime() === booking.startAt.getTime() &&
    (!selector || selector === booking.staffId)
  ) {
    throw new AppError('BAD_REQUEST', 'That is already the appointment time');
  }
  return startAt;
}

// ---------------------------------------------------------------------------
// Manage link flows
// ---------------------------------------------------------------------------

interface ManagedBooking {
  booking: BookingDocument;
  staff: StaffDocument;
  settings: ShopSettingsDocument;
}

/**
 * Verifies the signed token and loads the booking. Order matters: signature and
 * expiry first (no database work for junk), then cancelled (clear message), then
 * the version check (a link superseded by a reschedule).
 */
export async function resolveManageToken(token: string, now: Date): Promise<ManagedBooking> {
  const verified = verifyManageToken(getEnv().MANAGE_LINK_SECRET, token, now);
  if (!verified.ok) {
    if (verified.reason === 'expired') throw new AppError('TOKEN_EXPIRED', 'This link has expired');
    throw new AppError('INVALID_TOKEN', 'This link is not valid');
  }
  const booking = await bookingsRepo.findBookingById(verified.payload.b);
  if (!booking) throw new AppError('NOT_FOUND', 'Booking was not found');
  if (booking.status === 'cancelled')
    throw new AppError('BOOKING_CANCELLED', 'This booking was already cancelled');
  if (booking.manageTokenVersion !== verified.payload.v) {
    throw new AppError(
      'INVALID_TOKEN',
      'This link was replaced by a newer one. Check your latest email.',
    );
  }
  const [staff, settings] = await Promise.all([
    staffRepo.findStaffById(booking.staffId),
    shopSettingsRepo.requireShopSettings(),
  ]);
  if (!staff) throw new AppError('INTERNAL_ERROR', 'Booking refers to unknown staff');
  return { booking, staff, settings };
}

function withinCutoff(booking: BookingDocument, cutoffMinutes: number, now: Date): boolean {
  return booking.status === 'confirmed' && minutesBetween(now, booking.startAt) >= cutoffMinutes;
}

export function manageView(managed: ManagedBooking, now: Date): ManageBookingResponse {
  const { booking, staff, settings } = managed;
  return {
    booking: toBookingView(booking, staff),
    canCancel: withinCutoff(booking, settings.booking.cancelCutoffMinutes, now),
    canReschedule: withinCutoff(booking, settings.booking.rescheduleCutoffMinutes, now),
    cutoffs: {
      cancelMinutes: settings.booking.cancelCutoffMinutes,
      rescheduleMinutes: settings.booking.rescheduleCutoffMinutes,
    },
  };
}

export async function getManagedBooking(token: string, now: Date): Promise<ManageBookingResponse> {
  return manageView(await resolveManageToken(token, now), now);
}

export async function cancelViaToken(
  input: { token: string; reason?: string | undefined },
  meta: RequestMeta,
): Promise<BookingOutcome<ManageBookingResponse>> {
  const managed = await resolveManageToken(input.token, meta.now);
  if (!withinCutoff(managed.booking, managed.settings.booking.cancelCutoffMinutes, meta.now)) {
    throw new AppError(
      'BOOKING_NOT_CANCELLABLE',
      `Online cancellation closes ${managed.settings.booking.cancelCutoffMinutes} minutes before the appointment. Please call the shop.`,
    );
  }
  const reason = input.reason?.trim() ? input.reason.trim() : null;
  const { cancelled, outboxIds } = await withTransaction((session) =>
    cancelInTransaction(
      managed.booking,
      managed.staff,
      managed.settings,
      {
        actor: CUSTOMER,
        reason,
        audience: { customer: true, owner: true },
        requestId: meta.requestId,
        ip: meta.ip,
      },
      meta.now,
      session,
    ),
  );
  return {
    status: 200,
    body: manageView(
      { booking: cancelled, staff: managed.staff, settings: managed.settings },
      meta.now,
    ),
    outboxIds,
    replayed: false,
  };
}

export async function rescheduleViaToken(
  input: { token: string; startAt: string; staff?: string | undefined },
  meta: RequestMeta,
): Promise<BookingOutcome<RescheduleBookingResponse>> {
  const managed = await resolveManageToken(input.token, meta.now);
  const { booking, settings } = managed;
  if (!withinCutoff(booking, settings.booking.rescheduleCutoffMinutes, meta.now)) {
    throw new AppError(
      'BOOKING_NOT_RESCHEDULABLE',
      `Online rescheduling closes ${settings.booking.rescheduleCutoffMinutes} minutes before the appointment. Please call the shop.`,
    );
  }
  const startAt = rescheduleStart(booking, input.startAt, input.staff, settings.booking);
  const done = await rescheduleBookingAs(
    booking,
    settings,
    { startAt, selector: input.staff ?? booking.staffId },
    {
      actor: CUSTOMER,
      override: false,
      audience: { customer: true, owner: true },
      requestId: meta.requestId,
      ip: meta.ip,
    },
    meta.now,
  );
  const body: RescheduleBookingResponse = {
    booking: toBookingView(done.moved, done.staff),
    managePath: manageLinkFor(done.moved),
  };
  return { status: 200, body, outboxIds: done.outboxIds, replayed: false };
}

/** Rate limit for the manage endpoints, keyed by IP. */
export async function enforceManageRateLimit(
  ip: string,
  now: Date,
  limits?: Partial<BookingLimits>,
): Promise<void> {
  const limit = { ...DEFAULT_LIMITS, ...limits }.manageIpPer10Minutes;
  const hit = await rateLimitsRepo.hitRateLimit(
    `manage:ip:${ip}`,
    { limit, windowMs: 10 * 60_000 },
    now,
  );
  if (!hit.allowed) {
    throw new AppError('RATE_LIMITED', 'Too many requests. Please try again in a few minutes.', {
      retryAfterSeconds: hit.retryAfterSeconds,
    });
  }
}
