import type {
  ConflictOutcome,
  ConflictResolution,
  TimeBlockView,
  WhoIsInEntry,
} from '../../shared/api/admin';
import { shopDayBounds, shopLocalToUtc } from '../../shared/lib/time';
import type { ClosureDocument, ClosureInput } from '../../shared/schemas/closure';
import type { WeekHours } from '../../shared/schemas/common';
import type { TimeBlockDocument, TimeBlockKind } from '../../shared/schemas/timeBlock';
import type { Principal } from '../http/types';
import { AppError } from '../lib/errors';
import {
  closuresRepo,
  shopSettingsRepo,
  slotLocksRepo,
  staffRepo,
  timeBlocksRepo,
  weeklyHoursRepo,
} from '../repos';
import { actorOf, assertInScope, type Scope } from './access';
import { whoIsInForStaff, type Changed, type ServiceMeta } from './adminBookings';
import { toTimeBlockView } from './bookingView';
import { applyScheduleChange } from './scheduleChanges';

type Resolutions = readonly ConflictResolution[] | undefined;

function outcome(r: { kept: string[]; moved: string[]; cancelled: string[] }): ConflictOutcome {
  return { kept: r.kept, moved: r.moved, cancelled: r.cancelled };
}

async function requireLiveStaff(staffId: string): Promise<void> {
  const staff = await staffRepo.findStaffById(staffId);
  if (!staff || staff.deletedAt) throw new AppError('NOT_FOUND', 'Staff member was not found');
}

/** Barbers act on their own chair only, and only when the owner allows it. */
async function assertBarberMayBlock(principal: Principal, scope: Scope): Promise<void> {
  if (principal.role === 'owner' && scope.kind === 'all') return;
  const settings = await shopSettingsRepo.requireShopSettings();
  if (principal.role !== 'owner' && !settings.permissions.barbersCanBlockTime) {
    throw new AppError('FORBIDDEN', 'The owner has not allowed barbers to block their own time');
  }
}

// ---------------------------------------------------------------------------
// Time blocks
// ---------------------------------------------------------------------------

export interface TimeBlockInput {
  staffId: string;
  kind: TimeBlockKind;
  startAt: string;
  endAt: string;
  reason?: string | undefined;
  resolutions?: Resolutions;
}

/**
 * Blocks time on a chair. Time off, a day off and a blocked period go through
 * the conflict rule. A blocked period also takes slot locks for every 15 minute
 * block nobody holds, so it shares slots only with bookings the owner kept.
 */
export async function createTimeBlock(
  principal: Principal,
  scope: Scope,
  input: TimeBlockInput,
  meta: ServiceMeta,
): Promise<Changed<{ timeBlock: TimeBlockView } & ConflictOutcome>> {
  const staffId = scope.kind === 'chair' ? scope.staffId : input.staffId;
  assertInScope(scope, staffId, 'Staff member');
  await assertBarberMayBlock(principal, scope);
  await requireLiveStaff(staffId);
  if (scope.kind === 'chair' && input.kind !== 'block' && input.kind !== 'timeOff') {
    throw new AppError('FORBIDDEN', 'Only the owner can set days off and extra hours');
  }
  const actor = actorOf(principal);
  const range = { start: new Date(input.startAt), end: new Date(input.endAt) };
  const change = await applyScheduleChange<TimeBlockDocument>({
    actor,
    requestId: meta.requestId,
    now: meta.now,
    staffIds: [staffId],
    resolutions: input.resolutions,
    allowCancel: principal.role === 'owner' && scope.kind === 'all',
    audit: {
      action: 'block.create',
      entityType: 'timeBlock',
      entityId: (b) => b._id,
      meta: { kind: input.kind },
    },
    apply: (session) =>
      timeBlocksRepo.insertTimeBlock(
        {
          staffId,
          kind: input.kind,
          startAt: range.start,
          endAt: range.end,
          reason: input.reason?.trim() ? input.reason.trim() : null,
          createdBy: actor,
        },
        meta.now,
        { session },
      ),
    afterResolve: async (session, block) => {
      if (block.kind !== 'block') return;
      await slotLocksRepo.acquireUnheldSlotLocks(
        staffId,
        range,
        { holderType: 'timeBlock', holderId: block._id },
        meta.now,
        { session },
      );
    },
  });
  return {
    body: { timeBlock: toTimeBlockView(change.result), ...outcome(change) },
    outboxIds: change.outboxIds,
  };
}

/**
 * Removes a block. Removing time off only opens time, but removing extra hours
 * can leave bookings outside working time, so this goes through the rule too.
 */
export async function deleteTimeBlock(
  principal: Principal,
  scope: Scope,
  id: string,
  resolutions: Resolutions,
  meta: ServiceMeta,
): Promise<Changed<ConflictOutcome & { ok: true }>> {
  const block = await timeBlocksRepo.findTimeBlockById(id);
  if (!block) throw new AppError('NOT_FOUND', 'Time block was not found');
  assertInScope(scope, block.staffId, 'Time block');
  await assertBarberMayBlock(principal, scope);
  if (scope.kind === 'chair' && block.kind !== 'block' && block.kind !== 'timeOff') {
    throw new AppError('FORBIDDEN', 'Only the owner can change days off and extra hours');
  }
  const change = await applyScheduleChange({
    actor: actorOf(principal),
    requestId: meta.requestId,
    now: meta.now,
    staffIds: [block.staffId],
    resolutions,
    allowCancel: principal.role === 'owner' && scope.kind === 'all',
    audit: {
      action: 'block.delete',
      entityType: 'timeBlock',
      entityId: () => block._id,
      meta: { kind: block.kind, startAt: block.startAt, endAt: block.endAt },
    },
    apply: async (session) => {
      await slotLocksRepo.releaseSlotLocks(block._id, { session });
      await timeBlocksRepo.deleteTimeBlock(block._id, { session });
    },
  });
  return { body: { ok: true, ...outcome(change) }, outboxIds: change.outboxIds };
}

export async function listTimeBlocks(input: {
  from: string;
  to: string;
  staffId?: string | undefined;
}): Promise<{ timeBlocks: TimeBlockView[] }> {
  const range = { start: shopDayBounds(input.from).start, end: shopDayBounds(input.to).end };
  const blocks = input.staffId
    ? await timeBlocksRepo.listTimeBlocksForStaff(input.staffId, range)
    : await timeBlocksRepo.listTimeBlocksBetween(range);
  return { timeBlocks: blocks.map(toTimeBlockView) };
}

// ---------------------------------------------------------------------------
// Day status: in or out for one day
// ---------------------------------------------------------------------------

/**
 * "Out" adds a day off covering the whole shop day. "In" removes days off that
 * touch the day and, with hours, adds extra hours (for someone who does not
 * normally work that day).
 */
export async function setDayStatus(
  principal: Principal,
  staffId: string,
  input: {
    date: string;
    status: 'in' | 'out';
    start?: string | undefined;
    end?: string | undefined;
    resolutions?: Resolutions;
  },
  meta: ServiceMeta,
): Promise<Changed<{ entry: WhoIsInEntry } & ConflictOutcome>> {
  await requireLiveStaff(staffId);
  const actor = actorOf(principal);
  const day = shopDayBounds(input.date);
  const change = await applyScheduleChange({
    actor,
    requestId: meta.requestId,
    now: meta.now,
    staffIds: [staffId],
    resolutions: input.resolutions,
    allowCancel: principal.role === 'owner',
    audit: {
      action: input.status === 'out' ? 'staff.day.out' : 'staff.day.in',
      entityType: 'staff',
      entityId: () => staffId,
      meta: { date: input.date, start: input.start ?? null, end: input.end ?? null },
    },
    apply: async (session) => {
      const existing = await timeBlocksRepo.listTimeBlocksForStaff(staffId, day, { session });
      if (input.status === 'out') {
        if (
          existing.some((b) => b.kind === 'dayOff' && b.startAt <= day.start && b.endAt >= day.end)
        )
          return;
        await timeBlocksRepo.insertTimeBlock(
          {
            staffId,
            kind: 'dayOff',
            startAt: day.start,
            endAt: day.end,
            reason: 'Out for the day',
            createdBy: actor,
          },
          meta.now,
          { session },
        );
        return;
      }
      for (const block of existing.filter((b) => b.kind === 'dayOff')) {
        await timeBlocksRepo.deleteTimeBlock(block._id, { session });
      }
      if (input.start && input.end) {
        await timeBlocksRepo.insertTimeBlock(
          {
            staffId,
            kind: 'extraHours',
            startAt: shopLocalToUtc(input.date, input.start),
            endAt: shopLocalToUtc(input.date, input.end),
            reason: 'Extra hours',
            createdBy: actor,
          },
          meta.now,
          { session },
        );
      }
    },
  });
  return {
    body: { entry: await whoIsInForStaff(staffId, input.date), ...outcome(change) },
    outboxIds: change.outboxIds,
  };
}

// ---------------------------------------------------------------------------
// Weekly hours and closures
// ---------------------------------------------------------------------------

export async function getAllHours(): Promise<{
  shop: WeekHours;
  staff: { staffId: string; days: WeekHours }[];
}> {
  const docs = await weeklyHoursRepo.listAllHours();
  const empty: WeekHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  return {
    shop: docs.find((d) => d.subjectType === 'shop')?.days ?? empty,
    staff: docs.flatMap((d) =>
      d.subjectType === 'staff' && d.staffId ? [{ staffId: d.staffId, days: d.days }] : [],
    ),
  };
}

export async function setShopHours(
  principal: Principal,
  input: { days: WeekHours; resolutions?: Resolutions },
  meta: ServiceMeta,
): Promise<Changed<ConflictOutcome & { ok: true }>> {
  const change = await applyScheduleChange({
    actor: actorOf(principal),
    requestId: meta.requestId,
    now: meta.now,
    staffIds: 'all',
    resolutions: input.resolutions,
    allowCancel: true,
    audit: {
      action: 'hours.shop.update',
      entityType: 'weeklyHours',
      entityId: () => 'shop',
      meta: { days: input.days },
    },
    apply: async (session) => {
      await weeklyHoursRepo.setShopHours(input.days, meta.now, { session });
    },
  });
  return { body: { ok: true, ...outcome(change) }, outboxIds: change.outboxIds };
}

export async function setStaffHours(
  principal: Principal,
  staffId: string,
  input: { days: WeekHours; resolutions?: Resolutions },
  meta: ServiceMeta,
): Promise<Changed<ConflictOutcome & { ok: true }>> {
  await requireLiveStaff(staffId);
  const change = await applyScheduleChange({
    actor: actorOf(principal),
    requestId: meta.requestId,
    now: meta.now,
    staffIds: [staffId],
    resolutions: input.resolutions,
    allowCancel: true,
    audit: {
      action: 'hours.staff.update',
      entityType: 'staff',
      entityId: () => staffId,
      meta: { days: input.days },
    },
    apply: async (session) => {
      await weeklyHoursRepo.setStaffHours(staffId, input.days, meta.now, { session });
    },
  });
  return { body: { ok: true, ...outcome(change) }, outboxIds: change.outboxIds };
}

export async function listClosures(
  input: { from?: string | undefined; to?: string | undefined },
  today: string,
) {
  const closures = await closuresRepo.listClosuresBetween(
    input.from ?? today,
    input.to ?? '9999-12-31',
  );
  return {
    closures: closures.map((c) => ({
      id: c._id,
      date: c.date,
      kind: c.kind,
      intervals: c.intervals,
      label: c.label,
    })),
  };
}

/** Closing a day or setting special hours replaces that day's shop hours. */
export async function upsertClosure(
  principal: Principal,
  input: ClosureInput & { resolutions?: Resolutions },
  meta: ServiceMeta,
) {
  const { resolutions, ...closure } = input;
  const change = await applyScheduleChange<ClosureDocument>({
    actor: actorOf(principal),
    requestId: meta.requestId,
    now: meta.now,
    staffIds: 'all',
    resolutions,
    allowCancel: true,
    audit: {
      action: 'closure.upsert',
      entityType: 'closure',
      entityId: (c) => c._id,
      meta: { date: closure.date },
    },
    apply: (session) => closuresRepo.upsertClosure(closure, meta.now, { session }),
  });
  const c = change.result;
  return {
    body: {
      closure: { id: c._id, date: c.date, kind: c.kind, intervals: c.intervals, label: c.label },
      ...outcome(change),
    },
    outboxIds: change.outboxIds,
  };
}

/** Removing special hours that were longer than usual can shorten a day, so this is checked too. */
export async function deleteClosure(
  principal: Principal,
  id: string,
  resolutions: Resolutions,
  meta: ServiceMeta,
): Promise<Changed<ConflictOutcome & { ok: true }>> {
  const closure = await closuresRepo.findClosureById(id);
  if (!closure) throw new AppError('NOT_FOUND', 'That closure was not found');
  const change = await applyScheduleChange({
    actor: actorOf(principal),
    requestId: meta.requestId,
    now: meta.now,
    staffIds: 'all',
    resolutions,
    allowCancel: true,
    audit: {
      action: 'closure.delete',
      entityType: 'closure',
      entityId: () => closure._id,
      meta: { date: closure.date },
    },
    apply: async (session) => {
      await closuresRepo.deleteClosure(closure._id, { session });
    },
  });
  return { body: { ok: true, ...outcome(change) }, outboxIds: change.outboxIds };
}
