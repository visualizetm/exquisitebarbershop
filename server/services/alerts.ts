import type { AlertView } from '../../shared/api/admin';
import { alertsRepo, bookingsRepo, staffRepo } from '../repos';

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
