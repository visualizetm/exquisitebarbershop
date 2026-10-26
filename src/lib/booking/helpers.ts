import type { BookingView } from '@shared/api/bookings';
import type { PublicStaff } from '@shared/api/public';
import type { SummaryItem } from '@/components/booking/BookingSummary';

export function qualifiedStaff(staff: PublicStaff[], serviceIds: string[]): PublicStaff[] {
  return staff.filter(
    (s) => s.acceptsOnlineBooking && serviceIds.every((id) => s.serviceIds.includes(id)),
  );
}

/** A booked appointment has one barber, so its prices are exact, never "from". */
export function viewToSummary(view: BookingView): SummaryItem[] {
  return view.services.map((s) => ({
    name: s.name,
    priceCents: s.priceCents,
    priceFrom: false,
    durationMinutes: s.durationMinutes,
  }));
}
