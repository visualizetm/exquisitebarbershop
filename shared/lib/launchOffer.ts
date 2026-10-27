import type { BookingSource } from '../schemas/booking';
import type { Discount } from '../schemas/booking';
import type { LaunchOffer } from '../schemas/shopSettings';

/** The one discount code the site knows. Printed cards and ads say "$10 off your first online booking". */
export const LAUNCH_OFFER_CODE = 'LAUNCH10';

/** On, and inside its dates, on the shop date given. */
export function launchOfferIsLive(offer: LaunchOffer, shopDate: string): boolean {
  if (!offer.enabled || offer.amountCents <= 0) return false;
  if (offer.startsOn !== '' && shopDate < offer.startsOn) return false;
  if (offer.endsOn !== '' && shopDate > offer.endsOn) return false;
  return true;
}

/**
 * The discount a new booking gets, or null. Only a public online booking, only the first one for
 * the phone (a cancelled first booking frees it), only while the offer is live, only when the
 * price reaches the minimum, and never more than the price itself.
 */
export function launchOfferDiscount(
  offer: LaunchOffer,
  booking: { source: BookingSource; priceCents: number; shopDate: string; alreadyUsed: boolean },
): Discount | null {
  if (booking.source !== 'online') return null;
  if (booking.alreadyUsed) return null;
  if (!launchOfferIsLive(offer, booking.shopDate)) return null;
  if (booking.priceCents < offer.minTotalCents) return null;
  return {
    code: LAUNCH_OFFER_CODE,
    amountCents: Math.min(offer.amountCents, booking.priceCents),
    label: offer.label,
  };
}

/** What the discounts take off, in cents. */
export function discountCents(discounts: readonly Discount[] | undefined): number {
  return (discounts ?? []).reduce((sum, d) => sum + d.amountCents, 0);
}

/** The price minus the discounts, never below zero. */
export function totalAfterDiscounts(
  priceCents: number,
  discounts: readonly Discount[] | undefined,
): number {
  return Math.max(0, priceCents - discountCents(discounts));
}

/** The short tag the owner and the barbers see next to a price: "$10 off online". */
export function discountTag(discounts: readonly Discount[] | undefined): string | null {
  const cents = discountCents(discounts);
  if (cents <= 0) return null;
  const dollars = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return `$${dollars} off online`;
}

/** What a list of bookings is worth to the shop: each price after its discounts. */
export function sumAfterDiscounts(
  bookings: readonly { totalPriceCents: number; discounts?: readonly Discount[] | undefined }[],
): number {
  return bookings.reduce((sum, b) => sum + totalAfterDiscounts(b.totalPriceCents, b.discounts), 0);
}

/** What the discounts took off across a list of bookings. */
export function sumDiscounts(
  bookings: readonly { discounts?: readonly Discount[] | undefined }[],
): number {
  return bookings.reduce((sum, b) => sum + discountCents(b.discounts), 0);
}
