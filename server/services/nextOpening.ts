import type { NextOpening, NextOpeningsResponse } from '../../shared/api/availability';
import type { Opening, StaffOpeningsResponse } from '../../shared/api/public';
import { resolveServiceForStaff } from '../../shared/lib/servicePricing';
import { formatShopTime, shopDateOf, shopDayStart, toShopTime } from '../../shared/lib/time';
import type { ServiceDocument } from '../../shared/schemas/service';
import type { StaffDocument } from '../../shared/schemas/staff';
import { AppError } from '../lib/errors';
import { servicesRepo, shopSettingsRepo, staffRepo } from '../repos';
import {
  computeAvailability,
  nextOpenSlots,
  pricedService,
  pricedStaff,
  workingRangesFor,
  type AvailabilityContext,
  type OpenSlot,
} from './availability';
import { loadAvailabilityContext } from './availabilityData';

/** Days ahead the strip looks for a next opening. Bounded by the booking window too. */
const LOOKAHEAD_DAYS = 14;

/**
 * "2:15 PM" today, "Tomorrow 10:00 AM", else "Thu 10:00 AM". Weekday names
 * repeat after a week, which is why the lookahead stays within one.
 */
export function openingLabel(startAt: Date, now: Date): string {
  const day = shopDateOf(startAt);
  const today = shopDateOf(now);
  const tomorrow = shopDayStart(today).plus({ days: 1 }).toISODate() ?? '';
  const time = formatShopTime(startAt);
  if (day === today) return time;
  if (day === tomorrow) return `Tomorrow ${time}`;
  return `${toShopTime(startAt).toFormat('ccc')} ${time}`;
}

/** How long the chair takes for a service: its own time when it set one, else the shop's. */
export function minutesOnChair(staff: StaffDocument, service: ServiceDocument): number {
  return resolveServiceForStaff(pricedService(service), pricedStaff(staff)).durationMinutes;
}

/**
 * The service a chair's next opening is measured with: the owner's pick, else the chair's shortest
 * by the chair's own times (one chair's quick service is another's long one).
 */
export function serviceForChair(
  staff: StaffDocument,
  services: readonly ServiceDocument[],
  preferredId: string | null,
): ServiceDocument | null {
  const offered = services.filter((s) => staff.serviceIds.includes(s._id));
  const preferred = preferredId ? offered.find((s) => s._id === preferredId) : undefined;
  if (preferred) return preferred;
  return (
    [...offered].sort(
      (a, b) => minutesOnChair(staff, a) - minutesOnChair(staff, b) || a.sortOrder - b.sortOrder,
    )[0] ?? null
  );
}

interface Shared {
  ctx: AvailabilityContext;
  services: ServiceDocument[];
  today: string;
  toDate: string;
  /** shopSettings.nextOpenServiceId, when the owner set one. */
  preferred: string | null;
}

/** One load for every collection; the engine then runs per chair with its own service. */
async function loadShared(now: Date): Promise<Shared> {
  const [services, settings] = await Promise.all([
    servicesRepo.listPublicServices(),
    shopSettingsRepo.requireShopSettings(),
  ]);
  const today = shopDateOf(now);
  const ctx = await loadAvailabilityContext({
    fromDate: today,
    toDate: shopDayStart(today).plus({ days: LOOKAHEAD_DAYS }).toISODate() ?? today,
    serviceIds: services.map((s) => s._id),
    now,
  });
  const windowDays = Math.min(LOOKAHEAD_DAYS, ctx.settings.bookingWindowDays);
  const toDate = shopDayStart(today).plus({ days: windowDays }).toISODate() ?? today;
  return { ctx, services, today, toDate, preferred: settings.nextOpenServiceId };
}

function slotsFor(
  shared: Shared,
  staff: StaffDocument,
  service: ServiceDocument | null,
  limit: number,
  now: Date,
): OpenSlot[] {
  if (!service) return [];
  const result = computeAvailability(
    { fromDate: shared.today, toDate: shared.toDate, staff: staff._id },
    { ...shared.ctx, services: [service] },
  );
  return nextOpenSlots(result, now, limit);
}

export async function nextOpenings(now: Date): Promise<NextOpeningsResponse> {
  const shared = await loadShared(now);
  const staff = await staffRepo.listPublicStaff();
  const chairs: NextOpening[] = staff.map((s) => {
    const working = workingRangesFor(s._id, shared.today, shared.ctx);
    const status: NextOpening['status'] =
      working.ranges.length > 0 ? 'in' : working.reason === 'closed' ? 'closed' : 'off';
    const service = serviceForChair(s, shared.services, shared.preferred);
    const [slot] = slotsFor(shared, s, service, 1, now);
    return {
      staff: { id: s._id, slug: s.slug, name: s.name },
      status,
      nextOpen: slot ? slot.startAt.toISOString() : null,
      nextOpenLabel: slot ? openingLabel(slot.startAt, now) : null,
      serviceId: service?._id ?? null,
    };
  });
  return { date: shared.today, chairs };
}

export async function staffOpenings(
  slug: string,
  count: number,
  now: Date,
): Promise<StaffOpeningsResponse> {
  const staff = await staffRepo.findStaffBySlug(slug.toLowerCase());
  if (!staff || staff.deletedAt || !staff.showOnWebsite) {
    throw new AppError('NOT_FOUND', 'That chair is no longer listed');
  }
  const shared = await loadShared(now);
  const service = serviceForChair(staff, shared.services, shared.preferred);
  const openings: Opening[] = slotsFor(shared, staff, service, count, now).map((slot) => ({
    startAt: slot.startAt.toISOString(),
    endAt: slot.endAt.toISOString(),
    date: shopDateOf(slot.startAt),
    label: openingLabel(slot.startAt, now),
  }));
  return {
    staff: { id: staff._id, slug: staff.slug, name: staff.name },
    service: service
      ? { id: service._id, name: service.name, durationMinutes: minutesOnChair(staff, service) }
      : null,
    openings,
  };
}
