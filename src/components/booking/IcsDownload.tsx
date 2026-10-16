import type { BookingView } from '@shared/api/bookings';
import type { PublicShop } from '@shared/api/public';
import { bookingIcsUid, buildIcs } from '@shared/lib/ics';

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
    location: `${shop.address.line1}, ${shop.address.city}, ${shop.address.state} ${shop.address.postalCode}`,
    organizerName: shop.name,
    organizerEmail: shop.email,
    stamp: new Date(booking.createdAt),
    url: manageUrl,
  });
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  return (
    <a
      className="exq-ics-download exq-button"
      href={href}
      download={`appointment-${booking.referenceCode}.ics`}
      data-state="ready"
    >
      Add to calendar (.ics)
    </a>
  );
}
