import type { BookingView } from '@shared/api/bookings';
import type { PublicShop } from '@shared/api/public';
import { bookingIcsUid, buildIcs } from '@shared/lib/ics';
import { addressLine } from '@/lib/shop';

/** Offers the same calendar file that the confirmation email attaches. */
export function IcsDownload({
  booking,
  shop,
  manageUrl,
}: {
  booking: BookingView;
  shop: PublicShop;
  manageUrl: string;
}) {
  const ics = buildIcs({
    uid: bookingIcsUid(booking.id, window.location.host),
    sequence: booking.sequence,
    method: 'REQUEST',
    startAt: new Date(booking.startAt),
    endAt: new Date(booking.endAt),
    summary: `${shop.name}: ${booking.services.map((s) => s.name).join(', ')}`,
    description: `With ${booking.staff.name}. Reference ${booking.referenceCode}. Manage: ${manageUrl}`,
    location: addressLine(shop.address),
    organizerName: shop.name,
    // The public shop API sends an empty email while the shop has no real mailbox.
    ...(shop.email ? { organizerEmail: shop.email } : {}),
    stamp: new Date(booking.createdAt),
    url: manageUrl,
  });
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  return (
    <a
      className="exq-ics-download exq-btn"
      data-variant="outline"
      data-size="md"
      href={href}
      download={`appointment-${booking.referenceCode}.ics`}
      data-state="ready"
    >
      Add to calendar
    </a>
  );
}
