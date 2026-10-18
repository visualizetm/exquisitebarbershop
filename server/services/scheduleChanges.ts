import type { ClientSession } from 'mongodb';
import type { ConflictOutcome, ConflictResolution } from '../../shared/api/admin';
import { addMinutes } from '../../shared/lib/time';
import { shopDateOf, shopDayStart } from '../../shared/lib/time';
import type { BookingDocument } from '../../shared/schemas/booking';
import type { WeekHours } from '../../shared/schemas/common';
import type { StaffDocument } from '../../shared/schemas/staff';
import type { Actor } from '../../shared/schemas/timeBlock';
import { withTransaction } from '../db/transaction';
import { AppError } from '../lib/errors';
import {
  auditLogRepo,
  bookingsRepo,
  closuresRepo,
  scheduleGuardsRepo,
  shopSettingsRepo,
  slotLocksRepo,
  staffRepo,
  timeBlocksRepo,
  weeklyHoursRepo,
} from '../repos';
import { isWithinWorkingTime, type ScheduleSource } from './availability';
import { cancelInTransaction } from './bookingService';
import { unknownStaff } from './bookingView';
import { relockBlocks } from './locks';

/**
 * The conflict rule. A change to when chairs work (hours, closures, time off,
 * blocks, a day out, removing a chair or a service) must never silently leave an
 * upcoming booking outside working time. Every such change runs through
 * applyScheduleChange, which:
 *
 *  1. bumps the schedule guard of every chair it can affect, so a booking
 *     committing on one of those chairs at the same moment forces a retry;
 *  2. snapshots which upcoming bookings sit inside working time;
 *  3. applies the change, inside the same transaction;
 *  4. snapshots again. A booking that was inside and now is not is affected.
 *     So is any booking the change names directly (a removed service);
 *  5. if any affected booking lacks an explicit choice, throws SCHEDULE_CONFLICT
 *     with the list, which aborts the transaction and undoes the change;
 *  6. otherwise keeps (audited as an exception) or cancels each one, with or
 *     without telling the customer, and commits everything together.
 *
 * Bookings that were already outside working time before the change (earlier
 * exceptions, walk-ins after hours) are not reported again.
 */

export interface ScheduleChange<T> {
  actor: Actor;
  requestId: string | null;
  now: Date;
  /** Chairs whose working time may change, or 'all' for shop-wide changes. */
  staffIds: readonly string[] | 'all';
  resolutions: readonly ConflictResolution[] | undefined;
  /** Barbers may keep but never cancel a customer's booking. */
  allowCancel: boolean;
  /** Audit entry for the change itself. */
  audit: {
    action: string;
    entityType: string;
    entityId: (result: T) => string;
    meta?: Record<string, unknown>;
  };
  apply: (session: ClientSession) => Promise<T>;
  /** Bookings affected for a reason other than working time, such as a removed service. */
  alsoAffected?: (upcoming: readonly BookingDocument[]) => readonly BookingDocument[];
  /** Runs after the choices are applied, inside the transaction (e.g. lock blocked time). */
  afterResolve?: (session: ClientSession, result: T, kept: ReadonlySet<string>) => Promise<void>;
}

export interface ScheduleChangeResult<T> extends ConflictOutcome {
  result: T;
  outboxIds: string[];
}

interface Snapshot {
  source: ScheduleSource;
  staffById: Map<string, StaffDocument>;
  upcoming: BookingDocument[];
}

async function loadSnapshot(
  staffIds: readonly string[] | null,
  now: Date,
  session: ClientSession,
): Promise<Snapshot> {
  const opts = { session };
  const yesterday = shopDayStart(shopDateOf(now)).minus({ days: 1 }).toISODate() ?? shopDateOf(now);
  const [staff, hours, closures, timeBlocks, upcoming] = await Promise.all([
    staffRepo.listStaff({ includeDeleted: true }, opts),
    weeklyHoursRepo.listAllHours(opts),
    closuresRepo.listClosuresFrom(yesterday, opts),
    timeBlocksRepo.listTimeBlocksEndingAfter(
      new Date(now.getTime() - 24 * 3600_000),
      staffIds,
      opts,
    ),
    bookingsRepo.listUpcomingConfirmed(now, staffIds, opts),
  ]);
  let shopHours: WeekHours | null = null;
  const staffHours = new Map<string, WeekHours>();
  for (const doc of hours) {
    if (doc.subjectType === 'shop') shopHours = doc.days;
    else if (doc.staffId) staffHours.set(doc.staffId, doc.days);
  }
  return {
    source: { shopHours, staffHours, closures, timeBlocks },
    staffById: new Map(staff.map((s) => [s._id, s])),
    upcoming,
  };
}

function inside(snapshot: Snapshot, booking: BookingDocument): boolean {
  return isWithinWorkingTime(booking, snapshot.staffById.get(booking.staffId), snapshot.source);
}

function summarize(booking: BookingDocument, staffById: Map<string, StaffDocument>) {
  const staff = staffById.get(booking.staffId);
  return {
    bookingId: booking._id,
    referenceCode: booking.referenceCode,
    staffId: booking.staffId,
    staffName: staff?.name ?? 'Former staff',
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    customerName: booking.customer.name,
    services: booking.services.map((s) => s.name),
    hasEmail: booking.customer.email !== null,
  };
}

/** The span a booking holds: its time plus the buffer after it. */
function heldSpan(booking: BookingDocument) {
  return { start: booking.startAt, end: addMinutes(booking.endAt, booking.bufferMinutes) };
}

/** Whether a chair does every service of a booking and works all of its time. */
function canTake(snapshot: Snapshot, booking: BookingDocument, staff: StaffDocument): boolean {
  if (staff.deletedAt !== null) return false;
  if (!booking.services.every((s) => staff.serviceIds.includes(s.serviceId))) return false;
  return isWithinWorkingTime({ ...booking, staffId: staff._id }, staff, snapshot.source);
}

/**
 * Chairs a booking could move to at the same time: they do all its services, work the whole
 * duration, and hold no booking or block over it. Re-checked by the lock insert when the move
 * is applied, so a stale list can never double book.
 */
async function moveOptionsFor(
  snapshot: Snapshot,
  booking: BookingDocument,
  session: ClientSession,
): Promise<{ staffId: string; staffName: string }[]> {
  const options: { staffId: string; staffName: string }[] = [];
  const sorted = [...snapshot.staffById.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const staff of sorted) {
    if (staff._id === booking.staffId || !canTake(snapshot, booking, staff)) continue;
    const locks = await slotLocksRepo.listSlotLocksForStaff(staff._id, heldSpan(booking), {
      session,
    });
    if (locks.length === 0) options.push({ staffId: staff._id, staffName: staff.name });
  }
  return options;
}

export async function applyScheduleChange<T>(
  change: ScheduleChange<T>,
): Promise<ScheduleChangeResult<T>> {
  const choices = new Map((change.resolutions ?? []).map((r) => [r.bookingId, r]));
  if (!change.allowCancel && [...choices.values()].some((r) => r.action !== 'keep')) {
    throw new AppError('FORBIDDEN', 'Only the owner can cancel or move bookings');
  }
  return withTransaction(async (session) => {
    const scope = change.staffIds === 'all' ? null : [...change.staffIds];
    const guardIds =
      scope ?? (await staffRepo.listStaff({ includeDeleted: true }, { session })).map((s) => s._id);
    await scheduleGuardsRepo.bumpScheduleGuards(guardIds, change.now, { session });

    const before = await loadSnapshot(scope, change.now, session);
    const wasInside = new Set(before.upcoming.filter((b) => inside(before, b)).map((b) => b._id));

    const result = await change.apply(session);

    const after = await loadSnapshot(scope, change.now, session);
    const affected = new Map<string, BookingDocument>();
    for (const booking of after.upcoming) {
      if (wasInside.has(booking._id) && !inside(after, booking)) affected.set(booking._id, booking);
    }
    for (const booking of change.alsoAffected?.(after.upcoming) ?? [])
      affected.set(booking._id, booking);

    const unresolved = [...affected.values()].filter((b) => !choices.has(b._id));
    if (unresolved.length > 0) {
      throw new AppError(
        'SCHEDULE_CONFLICT',
        unresolved.length === 1
          ? 'One upcoming booking would fall outside working time. Choose what to do with it.'
          : `${unresolved.length} upcoming bookings would fall outside working time. Choose what to do with each.`,
        {
          extra: {
            affected: await Promise.all(
              [...affected.values()].map(async (b) => ({
                ...summarize(b, after.staffById),
                moveOptions: await moveOptionsFor(after, b, session),
              })),
            ),
          },
        },
      );
    }

    const kept: string[] = [];
    const moved: string[] = [];
    const cancelled: string[] = [];
    const outboxIds: string[] = [];
    const settings =
      affected.size > 0 ? await shopSettingsRepo.requireShopSettings({ session }) : null;
    for (const booking of affected.values()) {
      const choice = choices.get(booking._id);
      const action = choice?.action;
      if (choice?.action === 'move' && choice.toStaffId) {
        const target = after.staffById.get(choice.toStaffId);
        if (!target || !canTake(after, booking, target)) {
          throw new AppError(
            'SLOT_TAKEN',
            `${target?.name ?? 'That chair'} can not take this booking`,
          );
        }
        await scheduleGuardsRepo.bumpScheduleGuards([target._id], change.now, { session });
        // Release first, then take the same time on the new chair: a lock held by anyone else
        // (a booking made a moment ago) fails the insert and undoes the whole change.
        await slotLocksRepo.releaseSlotLocks(booking._id, { session });
        await slotLocksRepo.acquireSlotLocks(
          target._id,
          heldSpan(booking),
          { holderType: 'booking', holderId: booking._id },
          change.now,
          { session },
        );
        await relockBlocks(booking.staffId, heldSpan(booking), change.now, session);
        await bookingsRepo.moveBookingToStaff(booking._id, target._id, change.now, { session });
        await auditLogRepo.appendAuditEntry(
          {
            actor: change.actor,
            action: 'booking.move',
            entityType: 'booking',
            entityId: booking._id,
            before: { staffId: booking.staffId },
            after: { staffId: target._id },
            meta: { change: change.audit.action },
            requestId: change.requestId,
          },
          change.now,
          { session },
        );
        moved.push(booking._id);
        continue;
      }
      if (action === 'keep' || !settings) {
        kept.push(booking._id);
        await auditLogRepo.appendAuditEntry(
          {
            actor: change.actor,
            action: 'booking.keepException',
            entityType: 'booking',
            entityId: booking._id,
            before: null,
            after: null,
            meta: { change: change.audit.action },
            requestId: change.requestId,
          },
          change.now,
          { session },
        );
        continue;
      }
      const staff = after.staffById.get(booking.staffId) ?? unknownStaff(booking.staffId);
      const done = await cancelInTransaction(
        booking,
        staff,
        settings,
        {
          actor: change.actor,
          reason: 'The shop schedule changed',
          audience: { customer: action === 'cancelAndNotify', owner: false },
          requestId: change.requestId,
        },
        change.now,
        session,
      );
      cancelled.push(booking._id);
      outboxIds.push(...done.outboxIds);
    }

    await change.afterResolve?.(session, result, new Set(kept));
    await auditLogRepo.appendAuditEntry(
      {
        actor: change.actor,
        action: change.audit.action,
        entityType: change.audit.entityType,
        entityId: change.audit.entityId(result),
        before: null,
        after: null,
        meta: { ...change.audit.meta, kept, moved, cancelled },
        requestId: change.requestId,
      },
      change.now,
      { session },
    );
    return { result, kept, moved, cancelled, outboxIds };
  });
}
