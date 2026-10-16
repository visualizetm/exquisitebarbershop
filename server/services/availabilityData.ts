import type { ClientSession } from 'mongodb';
import { shopDayBounds } from '../../shared/lib/time';
import type { WeekHours } from '../../shared/schemas/common';
import type { ServiceDocument } from '../../shared/schemas/service';
import { AppError } from '../lib/errors';
import {
  bookingsRepo,
  closuresRepo,
  servicesRepo,
  shopSettingsRepo,
  staffRepo,
  timeBlocksRepo,
  weeklyHoursRepo,
} from '../repos';
import type { AvailabilityContext } from './availability';

export interface LoadAvailabilityInput {
  fromDate: string;
  toDate: string;
  serviceIds: string[];
  now: Date;
}

/**
 * Loads everything the engine needs for a date range with one query per
 * collection (seven in total), never one per day. Throws SERVICE_UNAVAILABLE when
 * any requested service is missing, inactive or deleted.
 */
export async function loadAvailabilityContext(
  input: LoadAvailabilityInput,
  session?: ClientSession,
): Promise<AvailabilityContext> {
  const opts = session ? { session } : undefined;
  const unique = new Set(input.serviceIds);
  if (unique.size !== input.serviceIds.length) {
    throw new AppError('VALIDATION_ERROR', 'Each service can be chosen once', {
      details: [{ path: 'serviceIds', message: 'Duplicate service' }],
    });
  }
  const range = {
    start: shopDayBounds(input.fromDate).start,
    end: shopDayBounds(input.toDate).end,
  };
  const [settings, services, staff, hours, closures, timeBlocks, bookings] = await Promise.all([
    shopSettingsRepo.requireShopSettings(opts),
    servicesRepo.findServicesByIds(input.serviceIds, opts),
    staffRepo.listStaff({}, opts),
    weeklyHoursRepo.listAllHours(opts),
    closuresRepo.listClosuresBetween(input.fromDate, input.toDate, opts),
    timeBlocksRepo.listTimeBlocksBetween(range, opts),
    bookingsRepo.listBookingsBetween(range, { statuses: ['confirmed'] }, opts),
  ]);

  const usable: ServiceDocument[] = services.filter((s) => s.deletedAt === null && s.isActive);
  if (usable.length !== input.serviceIds.length) {
    throw new AppError('SERVICE_UNAVAILABLE', 'One of the chosen services is no longer offered');
  }

  let shopHours: WeekHours | null = null;
  const staffHours = new Map<string, WeekHours>();
  for (const doc of hours) {
    if (doc.subjectType === 'shop') shopHours = doc.days;
    else if (doc.staffId) staffHours.set(doc.staffId, doc.days);
  }

  return {
    settings: settings.booking,
    services: usable,
    staff,
    shopHours,
    staffHours,
    closures,
    timeBlocks,
    bookings,
    now: input.now,
  };
}
