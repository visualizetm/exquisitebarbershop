import type { BookingView } from '@shared/api/bookings';
import type { PublicStaff } from '@shared/api/public';
import type { SummaryItem } from '@/components/booking/BookingSummary';

export function qualifiedStaff(staff: PublicStaff[], serviceIds: string[]): PublicStaff[] {
  return staff.filter(
    (s) => s.acceptsOnlineBooking && serviceIds.every((id) => s.serviceIds.includes(id)),
  );
}

/** "Free to cancel up to 2 hours before." from the shop's cutoff setting. */
export function cancelPolicyLabel(cutoffMinutes: number): string {
  if (cutoffMinutes <= 0) return 'Free to cancel any time before your appointment.';
  const hours = cutoffMinutes / 60;
  const span =
    cutoffMinutes % 60 === 0
      ? `${hours} ${hours === 1 ? 'hour' : 'hours'}`
      : `${cutoffMinutes} minutes`;
  return `Free to cancel up to ${span} before.`;
}

export function viewToSummary(view: BookingView): SummaryItem[] {
  return view.services.map((s) => ({
    name: s.name,
    priceCents: s.priceCents,
    priceFrom: s.priceFrom,
    durationMinutes: s.durationMinutes,
  }));
}
