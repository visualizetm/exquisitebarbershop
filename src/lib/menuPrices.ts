import type { PublicService, PublicStaff } from '@shared/api/public';
import {
  menuPrice,
  offersService,
  quoteFirstAvailable,
  quoteForStaff,
  resolveServiceForStaff,
  type PriceQuote,
} from '@shared/lib/servicePricing';

/**
 * The public price list. The shop has one price and time per service, and each person may charge
 * more or take longer (shared/lib/servicePricing.ts). Whatever a page prints goes through here, so
 * the services page, the home menu, a chair page and the booking steps agree.
 */

function withPrice(
  service: PublicService,
  line: { priceCents: number; priceFrom: boolean; durationMinutes: number },
): PublicService {
  return {
    ...service,
    priceCents: line.priceCents,
    priceFrom: line.priceFrom,
    durationMinutes: line.durationMinutes,
  };
}

/**
 * Every service as the menu prints it when no one is chosen: the lowest price among the people who
 * offer it, with "from" when they differ or the shop says so, and that person's time. `staff` is the
 * list the price may come from (everyone on the site for the price list, the people who take online
 * bookings for the booking steps).
 */
export function menuServices(
  services: readonly PublicService[],
  staff: readonly PublicStaff[],
): PublicService[] {
  return services.map((s) => withPrice(s, menuPrice(s, staff)));
}

/** One person's menu: the services they offer, each at their own price and time. */
export function chairServices(
  services: readonly PublicService[],
  member: PublicStaff,
): PublicService[] {
  return services
    .filter((s) => offersService(member, s.id))
    .map((s) => withPrice(s, resolveServiceForStaff(s, member)));
}

/**
 * The chosen services priced for the booking steps. With a person chosen, theirs; with first
 * available (or no one yet), the lowest total among the people who can be assigned, so the total
 * reads "From $x" when they differ. When nobody does every chosen service (the barber step then
 * says so), each service shows its own menu price.
 */
export function bookingQuote(
  chosen: readonly PublicService[],
  chair: PublicStaff | null,
  bookable: readonly PublicStaff[],
): { services: PublicService[]; quote: PriceQuote | null } {
  const quote = chair ? quoteForStaff(chosen, chair) : quoteFirstAvailable(chosen, bookable);
  if (!quote) return { services: menuServices(chosen, bookable), quote: null };
  return {
    services: chosen.map((s) => {
      const line = quote.lines.find((l) => l.serviceId === s.id);
      return line ? withPrice(s, line) : s;
    }),
    quote,
  };
}
