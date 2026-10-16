import type { BookingView } from '../../shared/api/bookings';
import { bookingViewSchema } from '../../shared/api/bookings';
import type { BookingDocument } from '../../shared/schemas/booking';
import type { StaffDocument } from '../../shared/schemas/staff';

/** Customer-safe projection. Never exposes staff private fields or other customers. */
export function toBookingView(
  booking: BookingDocument,
  staff: Pick<StaffDocument, '_id' | 'name' | 'slug'>,
): BookingView {
  return bookingViewSchema.parse({
    id: booking._id,
    referenceCode: booking.referenceCode,
    status: booking.status,
    source: booking.source,
    staff: { id: staff._id, name: staff.name, slug: staff.slug },
    staffRequested: booking.staffRequested,
    services: booking.services,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    durationMinutes: booking.durationMinutes,
    totalPriceCents: booking.totalPriceCents,
    customer: booking.customer,
    notes: booking.notes,
    sequence: booking.manageTokenVersion,
    createdAt: booking.createdAt.toISOString(),
  });
}
