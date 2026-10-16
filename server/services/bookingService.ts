import type { ClientSession } from 'mongodb';
import type { AvailabilitySlot } from '../../shared/api/availability';
import type {
  CreateBookingInput,
  CreateBookingResponse,
  ManageBookingResponse,
  RescheduleBookingResponse,
} from '../../shared/api/bookings';
import { generateReferenceCode } from '../../shared/lib/referenceCode';
import { addMinutes, minutesBetween, shopDateOf, shopDayStart } from '../../shared/lib/time';
import type { BookingDocument } from '../../shared/schemas/booking';
import type { ShopSettingsDocument } from '../../shared/schemas/shopSettings';
import type { StaffDocument } from '../../shared/schemas/staff';
import { withTransaction } from '../db/transaction';
import { getEnv } from '../env';
import { AppError } from '../lib/errors';
import { createManageToken, managePath, verifyManageToken } from '../lib/manageToken';
import { sha256Hex } from '../lib/ids';
import { stableStringify } from '../lib/objects';
import {
  auditLogRepo,
  bookingsRepo,
  idempotencyKeysRepo,
  rateLimitsRepo,
  shopSettingsRepo,
  slotLocksRepo,
  staffRepo,
} from '../repos';
import { ReferenceCodeCollision } from '../repos/bookingsRepo';
import {
  computeAvailability,
  findSlot,
  isOnSlotGrid,
  nextOpenSlots,
  type AvailabilityResult,
  type OpenSlot,
} from './availability';
import { loadAvailabilityContext } from './availabilityData';
import { enqueueBookingNotifications } from './bookingNotifications';
import { toBookingView } from './bookingView';

/** Grace period a manage link stays valid after the appointment ends. */
export const MANAGE_LINK_GRACE_DAYS = 7;
/** Days of availability loaded around a request, so SLOT_TAKEN can offer alternatives. */
const ALTERNATIVE_DAYS = 3;
const ALTERNATIVE_LIMIT = 5;
const MAX_ATTEMPTS = 6;

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

function manageLinkFor(booking: BookingDocument): string {
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

function reasonError(result: AvailabilityResult, startAt: Date): AppError {
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

async function alternativesAfter(
  input: { serviceIds: string[]; staff: string; startAt: Date; excludeBookingId?: string },
  now: Date,
): Promise<AvailabilitySlot[]> {
  const fromDate = shopDateOf(input.startAt);
  const toDate =
    shopDayStart(fromDate)
      .plus({ days: ALTERNATIVE_DAYS - 1 })
      .toISODate() ?? fromDate;
  const ctx = await loadAvailabilityContext({
    fromDate,
    toDate,
    serviceIds: input.serviceIds,
    now,
  });
  const request = input.excludeBookingId
    ? { fromDate, toDate, staff: input.staff, excludeBookingId: input.excludeBookingId }
    : { fromDate, toDate, staff: input.staff };
  const result = computeAvailability(request, ctx);
  return nextOpenSlots(result, input.startAt, ALTERNATIVE_LIMIT).map(toApiSlot);
}

async function slotTakenWithAlternatives(
  input: { serviceIds: string[]; staff: string; startAt: Date; excludeBookingId?: string },
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

interface PlacedBooking {
  booking: BookingDocument;
  staff: StaffDocument;
  settings: ShopSettingsDocument;
  outboxIds: string[];
}

/**
 * One attempt to place a booking on one chair, inside one transaction. The lock
 * insert is the arbiter: a duplicate aborts the whole transaction, which is why a
 * conflict surfaces as SLOT_TAKEN and the caller starts a new attempt.
 */
async function placeBooking(
  input: CreateBookingInput,
  startAt: Date,
  tried: ReadonlySet<string>,
  referenceCode: string,
  meta: RequestMeta,
  idempotency: { scope: string; key: string } | null,
  session: ClientSession,
): Promise<PlacedBooking> {
  const date = shopDateOf(startAt);
  const ctx = await loadAvailabilityContext(
    { fromDate: date, toDate: date, serviceIds: input.serviceIds, now: meta.now },
    session,
  );
  const settings = await shopSettingsRepo.requireShopSettings({ session });
  const result = computeAvailability({ fromDate: date, toDate: date, staff: input.staff }, ctx);
  const slot = findSlot(result, startAt);
  if (!slot) throw reasonError(result, startAt);
  const staffId = slot.candidates.find((id) => !tried.has(id));
  if (!staffId) throw new AppError('SLOT_TAKEN', 'That time is no longer available');
  const staff = result.staff.find((s) => s._id === staffId);
  if (!staff) throw new AppError('SLOT_TAKEN', 'That time is no longer available');

  const open = await bookingsRepo.countOpenBookingsForPhone(input.customer.phone, meta.now, {
    session,
  });
  if (open >= settings.booking.maxOpenBookingsPerPhone) {
    throw new AppError(
      'TOO_MANY_OPEN_BOOKINGS',
      'This phone number already has the maximum number of upcoming bookings',
    );
  }

  const endAt = addMinutes(startAt, result.serviceMinutes);
  const booking = await bookingsRepo.insertBooking(
    {
      referenceCode,
      staffId: staff._id,
      staffRequested: input.staff !== 'any',
      services: ctx.services.map((s) => ({
        serviceId: s._id,
        name: s.name,
        group: s.group,
        priceCents: s.priceCents,
        priceFrom: s.priceFrom,
        durationMinutes: s.durationMinutes,
      })),
      startAt,
      endAt,
      durationMinutes: result.serviceMinutes,
      bufferMinutes: result.bufferMinutes,
      totalPriceCents: ctx.services.reduce((sum, s) => sum + s.priceCents, 0),
      customer: input.customer,
      status: 'confirmed',
      source: 'online',
      notes: input.notes?.trim() ? input.notes.trim() : null,
      cancellation: null,
      rescheduledFromId: null,
      manageTokenVersion: 1,
    },
    meta.now,
    { session },
  );
  await slotLocksRepo.acquireSlotLocks(
    staff._id,
    { start: startAt, end: addMinutes(endAt, result.bufferMinutes) },
    { holderType: 'booking', holderId: booking._id },
    meta.now,
    { session },
  );
  await auditLogRepo.appendAuditEntry(
    {
      actor: { type: 'customer', userId: null, staffId: null },
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
      meta: { source: 'online', staffRequested: booking.staffRequested, ip: meta.ip },
      requestId: meta.requestId,
    },
    meta.now,
    { session },
  );
  const view = toBookingView(booking, staff);
  const outboxIds = await enqueueBookingNotifications(
    {
      event: 'confirmed',
      view,
      settings,
      managePath: manageLinkFor(booking),
      previousStartAt: null,
      cancelReason: null,
    },
    meta.now,
    session,
  );
  if (idempotency) {
    const body: CreateBookingResponse = { booking: view, managePath: manageLinkFor(booking) };
    await idempotencyKeysRepo.completeIdempotencyKey(
      idempotency.scope,
      idempotency.key,
      { status: 201, body },
      { session },
    );
  }
  return { booking, staff, settings, outboxIds };
}

/** Loops over chairs for "first available", one transaction per attempt. */
async function placeWithFallback(
  input: CreateBookingInput,
  startAt: Date,
  meta: RequestMeta,
  idempotency: { scope: string; key: string } | null,
): Promise<PlacedBooking> {
  const tried = new Set<string>();
  let lastConflict: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const referenceCode = await freshReferenceCode();
    try {
      return await withTransaction((session) =>
        placeBooking(input, startAt, tried, referenceCode, meta, idempotency, session),
      );
    } catch (error) {
      if (error instanceof ReferenceCodeCollision) continue;
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
    { serviceIds: input.serviceIds, staff: input.staff, startAt },
    meta.now,
    lastConflict,
  );
}

function parseStart(iso: string, settings?: ShopSettingsDocument['booking']): Date {
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

  const scope = 'bookings.create';
  const { website: _website, ...hashed } = input;
  const requestHash = sha256Hex(stableStringify(hashed));
  const claim = await idempotencyKeysRepo.beginIdempotencyKey(
    scope,
    meta.idempotencyKey,
    requestHash,
    meta.now,
  );
  if (claim.state === 'completed') {
    return {
      status: claim.response.status,
      body: claim.response.body as CreateBookingResponse,
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
    await enforceRateLimits({ ip: meta.ip, phone: input.customer.phone }, limits, meta.now);
    const placed = await placeWithFallback(input, startAt, meta, {
      scope,
      key: meta.idempotencyKey,
    });
    const body: CreateBookingResponse = {
      booking: toBookingView(placed.booking, placed.staff),
      managePath: manageLinkFor(placed.booking),
    };
    return { status: 201, body, outboxIds: placed.outboxIds, replayed: false };
  } catch (error) {
    await idempotencyKeysRepo.releaseIdempotencyKey(scope, meta.idempotencyKey);
    throw error;
  }
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
  const { cancelled, outboxIds } = await withTransaction(async (session) => {
    const cancelled = await bookingsRepo.cancelBooking(
      managed.booking._id,
      { at: meta.now, by: 'customer', reason },
      meta.now,
      { session },
    );
    await slotLocksRepo.releaseSlotLocks(cancelled._id, { session });
    await auditLogRepo.appendAuditEntry(
      {
        actor: { type: 'customer', userId: null, staffId: null },
        action: 'booking.cancel',
        entityType: 'booking',
        entityId: cancelled._id,
        before: { status: 'confirmed' },
        after: { status: 'cancelled' },
        meta: { reason, ip: meta.ip },
        requestId: meta.requestId,
      },
      meta.now,
      { session },
    );
    const outboxIds = await enqueueBookingNotifications(
      {
        event: 'cancelled',
        view: toBookingView(cancelled, managed.staff),
        settings: managed.settings,
        managePath: null,
        previousStartAt: null,
        cancelReason: reason,
      },
      meta.now,
      session,
    );
    return { cancelled, outboxIds };
  });
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
  const startAt = parseStart(input.startAt, settings.booking);
  if (
    startAt.getTime() === booking.startAt.getTime() &&
    (!input.staff || input.staff === booking.staffId)
  ) {
    throw new AppError('BAD_REQUEST', 'That is already the appointment time');
  }
  const selector = input.staff ?? booking.staffId;
  const serviceIds = booking.services.map((s) => s.serviceId);
  const tried = new Set<string>();
  let lastConflict: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const placed = await withTransaction(async (session) => {
        const date = shopDateOf(startAt);
        const ctx = await loadAvailabilityContext(
          { fromDate: date, toDate: date, serviceIds, now: meta.now },
          session,
        );
        const result = computeAvailability(
          { fromDate: date, toDate: date, staff: selector, excludeBookingId: booking._id },
          ctx,
        );
        const slot = findSlot(result, startAt);
        if (!slot) throw reasonError(result, startAt);
        const staffId = slot.candidates.find((id) => !tried.has(id));
        const staff = staffId ? result.staff.find((s) => s._id === staffId) : undefined;
        if (!staffId || !staff)
          throw new AppError('SLOT_TAKEN', 'That time is no longer available');

        const endAt = addMinutes(startAt, result.serviceMinutes);
        // Release first so moving within the same chair's current window works.
        await slotLocksRepo.releaseSlotLocks(booking._id, { session });
        await slotLocksRepo.acquireSlotLocks(
          staff._id,
          { start: startAt, end: addMinutes(endAt, result.bufferMinutes) },
          { holderType: 'booking', holderId: booking._id },
          meta.now,
          { session },
        );
        const moved = await bookingsRepo.rescheduleBooking(
          booking._id,
          {
            staffId: staff._id,
            staffRequested: selector !== 'any',
            startAt,
            endAt,
            bufferMinutes: result.bufferMinutes,
          },
          meta.now,
          { session },
        );
        await auditLogRepo.appendAuditEntry(
          {
            actor: { type: 'customer', userId: null, staffId: null },
            action: 'booking.reschedule',
            entityType: 'booking',
            entityId: moved._id,
            before: { staffId: booking.staffId, startAt: booking.startAt, endAt: booking.endAt },
            after: { staffId: moved.staffId, startAt: moved.startAt, endAt: moved.endAt },
            meta: { ip: meta.ip },
            requestId: meta.requestId,
          },
          meta.now,
          { session },
        );
        const view = toBookingView(moved, staff);
        const outboxIds = await enqueueBookingNotifications(
          {
            event: 'rescheduled',
            view,
            settings,
            managePath: manageLinkFor(moved),
            previousStartAt: booking.startAt,
            cancelReason: null,
          },
          meta.now,
          session,
        );
        return { moved, staff, outboxIds };
      });
      const body: RescheduleBookingResponse = {
        booking: toBookingView(placed.moved, placed.staff),
        managePath: manageLinkFor(placed.moved),
      };
      return { status: 200, body, outboxIds: placed.outboxIds, replayed: false };
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
    { serviceIds, staff: selector, startAt, excludeBookingId: booking._id },
    meta.now,
    lastConflict,
  );
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
