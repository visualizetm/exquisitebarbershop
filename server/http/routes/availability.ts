import {
  availabilityDaysQuerySchema,
  availabilityDaysResponseSchema,
  availabilityQuerySchema,
  availabilityResponseSchema,
  nextOpeningsResponseSchema,
} from '../../../shared/api/availability';
import { shopDateOf, shopDayStart } from '../../../shared/lib/time';
import { AppError } from '../../lib/errors';
import {
  bookingWindowEnd,
  computeAvailability,
  effectiveBufferMinutes,
  REASON_TEXT,
  resolveStaffSelector,
  serviceMinutesOf,
  type AvailabilityContext,
  type AvailabilityResult,
} from '../../services/availability';
import { loadAvailabilityContext } from '../../services/availabilityData';
import { nextOpenings } from '../../services/nextOpening';
import { parseQuery } from '../request';
import type { RouteDefinition } from '../types';

/** Longest range the days endpoint will compute in one call. */
const MAX_DAYS = 62;

/**
 * Minutes one appointment holds a chair, services plus cleanup. Chairs can differ (a chair's own
 * time for a service replaces the shop's), so this is the shortest of the chairs offered; every
 * slot carries its own chair and end. With no chair offered it is the shop's own time.
 */
function shortestTotalMinutes(result: AvailabilityResult, ctx: AvailabilityContext): number {
  const totals = [...result.quotes.values()].map((q) => q.totalMinutes);
  return totals.length > 0
    ? Math.min(...totals)
    : serviceMinutesOf(ctx.services) + effectiveBufferMinutes(ctx.services, ctx.settings);
}

export const availabilityRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/availability/next',
    auth: 'public',
    handler: async (ctx) => {
      const body = nextOpeningsResponseSchema.parse(await nextOpenings(ctx.now));
      return { body, headers: { 'Cache-Control': 'public, max-age=30' } };
    },
  },
  {
    method: 'GET',
    path: '/api/availability',
    auth: 'public',
    handler: async (ctx) => {
      const query = parseQuery(ctx, availabilityQuerySchema);
      const data = await loadAvailabilityContext({
        fromDate: query.date,
        toDate: query.date,
        serviceIds: query.serviceIds,
        now: ctx.now,
      });
      if (query.staff !== 'any' && !resolveStaffSelector(data.staff, query.staff)) {
        throw new AppError('NOT_FOUND', 'That chair was not found');
      }
      const result = computeAvailability(
        { fromDate: query.date, toDate: query.date, staff: query.staff },
        data,
      );
      const day = result.days[0];
      const body = availabilityResponseSchema.parse({
        date: query.date,
        durationMinutes: shortestTotalMinutes(result, data),
        slots: (day?.slots ?? []).map((s) => ({
          startAt: s.startAt.toISOString(),
          endAt: s.endAt.toISOString(),
          staffId: s.staffId,
        })),
        reason: day?.reason ?? null,
        closedReason: day?.reason ? REASON_TEXT[day.reason] : null,
      });
      return { body, headers: { 'Cache-Control': 'public, max-age=10' } };
    },
  },
  {
    method: 'GET',
    path: '/api/availability/days',
    auth: 'public',
    handler: async (ctx) => {
      const query = parseQuery(ctx, availabilityDaysQuerySchema);
      const today = shopDateOf(ctx.now);
      const fromDate = query.from ?? today;
      const settingsEnd = async () => {
        const data = await loadAvailabilityContext({
          fromDate,
          toDate: fromDate,
          serviceIds: query.serviceIds,
          now: ctx.now,
        });
        return bookingWindowEnd(ctx.now, data.settings);
      };
      let toDate = query.to ?? (await settingsEnd());
      if (toDate < fromDate)
        throw new AppError('VALIDATION_ERROR', 'The range end is before its start');
      const cap =
        shopDayStart(fromDate)
          .plus({ days: MAX_DAYS - 1 })
          .toISODate() ?? toDate;
      if (toDate > cap) toDate = cap;
      const data = await loadAvailabilityContext({
        fromDate,
        toDate,
        serviceIds: query.serviceIds,
        now: ctx.now,
      });
      if (query.staff !== 'any' && !resolveStaffSelector(data.staff, query.staff)) {
        throw new AppError('NOT_FOUND', 'That chair was not found');
      }
      const result = computeAvailability({ fromDate, toDate, staff: query.staff }, data);
      const days = result.days.map((d) => ({
        date: d.date,
        available: d.slots.length > 0,
        reason: d.reason,
        count: d.slots.length,
      }));
      const body = availabilityDaysResponseSchema.parse({
        from: fromDate,
        to: toDate,
        days,
        availableDates: days.filter((d) => d.available).map((d) => d.date),
      });
      return { body, headers: { 'Cache-Control': 'public, max-age=30' } };
    },
  },
];
