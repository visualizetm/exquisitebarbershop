import { shopDayBounds } from '../../shared/lib/time';
import type { WeekHours } from '../../shared/schemas/common';
import type { StaffDocument } from '../../shared/schemas/staff';
import { closuresRepo, staffRepo, timeBlocksRepo, weeklyHoursRepo } from '../repos';
import type { ScheduleSource } from './availability';

export interface ScheduleData {
  source: ScheduleSource;
  staff: StaffDocument[];
}

/** Hours, closures, blocks and staff for a date range: one query per collection. */
export async function loadScheduleData(fromDate: string, toDate: string): Promise<ScheduleData> {
  const range = { start: shopDayBounds(fromDate).start, end: shopDayBounds(toDate).end };
  const [hours, closures, timeBlocks, staff] = await Promise.all([
    weeklyHoursRepo.listAllHours(),
    closuresRepo.listClosuresBetween(fromDate, toDate),
    timeBlocksRepo.listTimeBlocksBetween(range),
    staffRepo.listStaff({ includeDeleted: true }),
  ]);
  let shopHours: WeekHours | null = null;
  const staffHours = new Map<string, WeekHours>();
  for (const doc of hours) {
    if (doc.subjectType === 'shop') shopHours = doc.days;
    else if (doc.staffId) staffHours.set(doc.staffId, doc.days);
  }
  return { source: { shopHours, staffHours, closures, timeBlocks }, staff };
}
