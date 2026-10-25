import type { BookingView } from '@shared/api/bookings';
import type { PublicStaff } from '@shared/api/public';
import type { SummaryItem } from '@/components/booking/BookingSummary';

export function qualifiedStaff(staff: PublicStaff[], serviceIds: string[]): PublicStaff[] {
  return staff.filter(
    (s) => s.acceptsOnlineBooking && serviceIds.every((id) => s.serviceIds.includes(id)),
  );
}

export function viewToSummary(view: BookingView): SummaryItem[] {
  return view.services.map((s) => ({
    name: s.name,
    priceCents: s.priceCents,
    priceFrom: s.priceFrom,
    durationMinutes: s.durationMinutes,
  }));
}
