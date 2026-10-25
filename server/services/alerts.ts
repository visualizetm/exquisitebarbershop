import type { AlertView, ConflictOutcome, ConflictResolution } from '../../shared/api/admin';
import type { Principal } from '../http/types';
import { AppError } from '../lib/errors';
import { alertsRepo, bookingsRepo, staffRepo } from '../repos';
import { actorOf, ownerScope } from './access';
import { createTimeBlock } from './adminSchedule';
import type { Changed, ServiceMeta } from './adminBookings';
import { applyScheduleChange } from './scheduleChanges';

/**
 * The open alerts with how many confirmed bookings each still affects. An alert whose bookings
 * have all been moved or cancelled since it was raised closes itself here, so the strip never
 * shows a decision that has nothing left to decide.
 */
export async function listAlertViews(now: Date): Promise<AlertView[]> {
  const open = await alertsRepo.listOpenAlerts();
  if (open.length === 0) return [];
  const staff = await staffRepo.listStaff({ includeDeleted: true });
  const names = new Map(staff.map((s) => [s._id, s.name]));
  const views: AlertView[] = [];
  for (const alert of open) {
    const affected = await bookingsRepo.listBookingsBetween(
      { start: alert.startAt, end: alert.endAt },
      { staffId: alert.staffId, statuses: ['confirmed'] },
    );
    if (affected.length === 0 && alert.kind === 'barberOut') {
      await alertsRepo.closeAlert(alert._id, 'resolved', null, now);
      continue;
    }
    views.push({
      id: alert._id,
      kind: alert.kind,
      staffId: alert.staffId,
      staffName: names.get(alert.staffId) ?? 'Former staff',
      fromDate: alert.fromDate,
      toDate: alert.toDate,
      startAt: alert.startAt.toISOString(),
      endAt: alert.endAt.toISOString(),
      reason: alert.reason,
      createdAt: alert.createdAt.toISOString(),
      affectedCount: affected.length,
    });
  }
  return views;
}

/**
 * The owner's decision on an alert. For a barber who is out, the time off already exists and
 * the bookings still stand; every affected booking needs one choice (Move, Keep, Cancel or Cancel
 * and notify) and the alert closes with the last one. For a time off request nothing exists yet:
 * the request is approved by creating the time off with the owner's choices, in one change.
 * Without choices a conflict answers with the list, exactly like any other schedule change.
 */
export async function resolveAlert(
  principal: Principal,
  id: string,
  resolutions: readonly ConflictResolution[] | undefined,
  meta: ServiceMeta,
): Promise<Changed<ConflictOutcome & { ok: true }>> {
  ownerScope(principal);
  const alert = await alertsRepo.findAlertById(id);
  if (!alert) throw new AppError('NOT_FOUND', 'That alert was not found');
  if (alert.status !== 'open')
    throw new AppError('CONFLICT', 'That alert has already been dealt with');

  if (alert.kind === 'timeOffRequest') {
    const done = await createTimeBlock(
      principal,
      { kind: 'all' },
      {
        staffId: alert.staffId,
        kind: 'timeOff',
        startAt: alert.startAt.toISOString(),
        endAt: alert.endAt.toISOString(),
        ...(alert.reason ? { reason: alert.reason } : {}),
        ...(resolutions ? { resolutions: [...resolutions] } : {}),
      },
      meta,
    );
    await alertsRepo.closeAlert(id, 'resolved', principal.userId, meta.now);
    return {
      body: {
        ok: true,
        kept: done.body.kept,
        moved: done.body.moved,
        cancelled: done.body.cancelled,
      },
      outboxIds: done.outboxIds,
    };
  }

  const change = await applyScheduleChange({
    actor: actorOf(principal),
    requestId: meta.requestId,
    now: meta.now,
    staffIds: [alert.staffId],
    resolutions,
    allowCancel: true,
    audit: { action: 'alert.resolve', entityType: 'alert', entityId: () => alert._id },
    apply: () => Promise.resolve(undefined),
    alsoAffected: (upcoming) =>
      upcoming.filter(
        (b) => b.staffId === alert.staffId && b.startAt < alert.endAt && b.endAt > alert.startAt,
      ),
    afterResolve: async (session) => {
      await alertsRepo.closeAlert(id, 'resolved', principal.userId, meta.now, { session });
    },
  });
  return {
    body: { ok: true, kept: change.kept, moved: change.moved, cancelled: change.cancelled },
    outboxIds: change.outboxIds,
  };
}

/** Closes an alert without deciding anything: declines a time off request, or dismisses a notice. */
export async function dismissAlert(principal: Principal, id: string, now: Date): Promise<void> {
  ownerScope(principal);
  const closed = await alertsRepo.closeAlert(id, 'dismissed', principal.userId, now);
  if (!closed) throw new AppError('NOT_FOUND', 'That alert was not found, or is already closed');
}
