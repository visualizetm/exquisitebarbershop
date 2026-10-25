import type { ServicePrice } from '../schemas/staff';

/**
 * Per person prices, in one pure place. Barbers charge different amounts (and take different
 * times) for the same service, so a service has the shop's own price and time and each person may
 * override either. Every number a customer, an email or the owner sees about a price comes from
 * here:
 *
 * - A chosen or assigned person: that person's override, else the shop's price and time.
 * - First available, or nobody chosen yet: the person with the lowest total among those who can
 *   do every chosen service, shown as a "from" price. The time is that same person's, so the price
 *   and the minutes always describe one real person.
 * - Several services: the sum of each line for the one person who does them all.
 *
 * Nothing here touches a database or a clock, so the same code prices a booking on the server and
 * the preview on the client.
 */

/** The parts of a service the pricing needs. Server documents map `_id` to `id` before calling. */
export interface PricedService {
  id: string;
  priceCents: number;
  priceFrom: boolean;
  durationMinutes: number;
}

/** The parts of a staff record the pricing needs. */
export interface PricedStaff {
  id: string;
  /** Breaks a tie between two equal quotes, lowest first. */
  sortOrder?: number | undefined;
  serviceIds: readonly string[];
  servicePrices?: readonly ServicePrice[] | undefined;
}

/** One service as one person does it. */
export interface ResolvedService {
  serviceId: string;
  priceCents: number;
  durationMinutes: number;
  /** The shop's "from" flag, plus true when first available could land on a different price. */
  priceFrom: boolean;
  /** True when the person's own entry supplied the price. */
  overridden: boolean;
}

/** The price and time of a list of services for one person, or for the cheapest of several. */
export interface PriceQuote {
  /** Whose prices these are. */
  staffId: string;
  lines: ResolvedService[];
  totalCents: number;
  totalMinutes: number;
  /** Show the total as "From $x": a line is flagged "from", or first available may cost more. */
  from: boolean;
}

function isCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function offersService(staff: Pick<PricedStaff, 'serviceIds'>, serviceId: string): boolean {
  return staff.serviceIds.includes(serviceId);
}

/**
 * The person's own entry for a service. An entry that cannot be a price (not whole cents, below
 * zero) is ignored, so a damaged record falls back to the shop's price instead of charging nonsense.
 * With two entries for one service the first wins; writes never allow two.
 */
export function overrideFor(
  staff: Pick<PricedStaff, 'servicePrices'>,
  serviceId: string,
): ServicePrice | undefined {
  return staff.servicePrices?.find((p) => p.serviceId === serviceId && isCents(p.priceCents));
}

/** One service for one person: their price and time when they set them, else the shop's. */
export function resolveServiceForStaff(
  service: PricedService,
  staff: Pick<PricedStaff, 'servicePrices'>,
): ResolvedService {
  const own = overrideFor(staff, service.id);
  return {
    serviceId: service.id,
    priceCents: own ? own.priceCents : service.priceCents,
    durationMinutes: isMinutes(own?.durationMinutes)
      ? own.durationMinutes
      : service.durationMinutes,
    priceFrom: service.priceFrom,
    overridden: own !== undefined,
  };
}

/**
 * Several services for one chosen person. Null when the person does not offer every one, because
 * they could not be booked for them.
 */
export function quoteForStaff(
  services: readonly PricedService[],
  staff: PricedStaff,
): PriceQuote | null {
  if (!services.every((s) => offersService(staff, s.id))) return null;
  const lines = services.map((s) => resolveServiceForStaff(s, staff));
  return {
    staffId: staff.id,
    lines,
    totalCents: lines.reduce((sum, l) => sum + l.priceCents, 0),
    totalMinutes: lines.reduce((sum, l) => sum + l.durationMinutes, 0),
    from: lines.some((l) => l.priceFrom),
  };
}

interface Candidate {
  quote: PriceQuote;
  sortOrder: number;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    a.quote.totalCents - b.quote.totalCents ||
    a.quote.totalMinutes - b.quote.totalMinutes ||
    a.sortOrder - b.sortOrder ||
    a.quote.staffId.localeCompare(b.quote.staffId)
  );
}

/**
 * First available, or no one chosen yet: the lowest total among the people who offer every chosen
 * service. The caller passes the people who could be assigned (online bookable ones for a booking,
 * everyone on the menu for the price list). The result is flagged "from" when the people differ
 * on price, because the real total is whoever ends up assigned. Null when nobody offers them all.
 */
export function quoteFirstAvailable(
  services: readonly PricedService[],
  candidates: readonly PricedStaff[],
): PriceQuote | null {
  const priced: Candidate[] = [];
  for (const staff of candidates) {
    const quote = quoteForStaff(services, staff);
    if (quote) priced.push({ quote, sortOrder: staff.sortOrder ?? 0 });
  }
  priced.sort(compareCandidates);
  const best = priced[0]?.quote;
  if (!best) return null;
  const lines = best.lines.map((line, index) => ({
    ...line,
    priceFrom:
      line.priceFrom || priced.some((c) => c.quote.lines[index]?.priceCents !== line.priceCents),
  }));
  const totalsDiffer = priced.some((c) => c.quote.totalCents !== best.totalCents);
  return { ...best, lines, from: totalsDiffer || lines.some((l) => l.priceFrom) };
}

/**
 * The price list entry for one service: what to print when no particular person is meant.
 * The lowest price among the people who offer it, "from" when they differ or the shop says so, with
 * that person's time. A service nobody offers keeps the shop's own price and time.
 */
export function menuPrice(service: PricedService, staff: readonly PricedStaff[]): ResolvedService {
  const line = quoteFirstAvailable([service], staff)?.lines[0];
  return (
    line ?? {
      serviceId: service.id,
      priceCents: service.priceCents,
      durationMinutes: service.durationMinutes,
      priceFrom: service.priceFrom,
      overridden: false,
    }
  );
}

export interface ServicePriceIssue {
  path: (string | number)[];
  message: string;
}

/**
 * What is wrong with a list of overrides against the services a person offers: two entries for one
 * service, or an entry for a service that is not on their menu. Empty means the list is fine.
 */
export function servicePriceIssues(
  serviceIds: readonly string[],
  prices: readonly ServicePrice[],
): ServicePriceIssue[] {
  const issues: ServicePriceIssue[] = [];
  const seen = new Set<string>();
  prices.forEach((entry, index) => {
    if (seen.has(entry.serviceId)) {
      issues.push({ path: [index, 'serviceId'], message: 'Only one price per service' });
    }
    seen.add(entry.serviceId);
    if (!serviceIds.includes(entry.serviceId)) {
      issues.push({
        path: [index, 'serviceId'],
        message: 'This person does not offer that service',
      });
    }
  });
  return issues;
}

/** The overrides that still belong to a menu: dropping a service drops its price with it. */
export function pruneServicePrices(
  serviceIds: readonly string[],
  prices: readonly ServicePrice[],
): ServicePrice[] {
  return prices.filter((p) => serviceIds.includes(p.serviceId));
}
