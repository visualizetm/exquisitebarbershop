import {
  adminBookingViewSchema,
  type AdminBookingView,
  type StaffRef,
  type TimeBlockView,
} from '../../shared/api/admin';
import type { BookingView } from '../../shared/api/bookings';
import { bookingViewSchema } from '../../shared/api/bookings';
import type { BookingDocument } from '../../shared/schemas/booking';
import type { StaffDocument } from '../../shared/schemas/staff';
import type { TimeBlockDocument } from '../../shared/schemas/timeBlock';

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

export function toAdminBookingView(
  booking: BookingDocument,
  staff: Pick<StaffDocument, '_id' | 'name' | 'slug'>,
): AdminBookingView {
  return adminBookingViewSchema.parse({
    ...toBookingView(booking, staff),
    isNew: booking.source === 'online' && booking.status !== 'cancelled' && !booking.ownerSeenAt,
    bufferMinutes: booking.bufferMinutes,
    cancellation: booking.cancellation
      ? {
          at: booking.cancellation.at.toISOString(),
          by: booking.cancellation.by,
          reason: booking.cancellation.reason,
        }
      : null,
    rescheduledFromId: booking.rescheduledFromId,
    ownerSeenAt: booking.ownerSeenAt?.toISOString() ?? null,
    updatedAt: booking.updatedAt.toISOString(),
  });
}

export function toTimeBlockView(block: TimeBlockDocument): TimeBlockView {
  return {
    id: block._id,
    staffId: block.staffId,
    kind: block.kind,
    startAt: block.startAt.toISOString(),
    endAt: block.endAt.toISOString(),
    reason: block.reason,
    createdBy: block.createdBy.type,
    createdAt: block.createdAt.toISOString(),
  };
}

export function toStaffRef(staff: StaffDocument): StaffRef {
  return { id: staff._id, name: staff.name, slug: staff.slug, chairNumber: staff.chairNumber };
}

/** Stand-in when a booking points at a staff record that no longer loads. */
export function unknownStaff(staffId: string): Pick<StaffDocument, '_id' | 'name' | 'slug'> {
  return { _id: staffId, name: 'Former staff', slug: 'former-staff' };
}
