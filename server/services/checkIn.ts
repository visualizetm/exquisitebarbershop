import type { CheckInMatch } from '../../shared/api/checkIn';
import { shopDateOf, shopDayBounds } from '../../shared/lib/time';
import type { BookingDocument } from '../../shared/schemas/booking';
import type { Principal } from '../http/types';
import { bookingsRepo, staffRepo } from '../repos';
import { type Scope, assertInScope } from './access';
import { type ServiceMeta, stampBookingMoment } from './adminBookings';

const MAX_MATCHES = 8;

/** "Chris Martin" becomes "Chris M."; a single word stays as it is. */
export function maskName(full: string): string {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Guest';
  const first = words[0] ?? '';
  const last = words[words.length - 1] ?? '';
  return words.length > 1 ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

/** Four or more digits look for the end of the phone; anything else is a name prefix, per word. */
export function matchesQuery(b: BookingDocument, q: string): boolean {
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 4 && digits.length === q.replace(/[\s()-]/g, '').length) {
    return b.customer.phone.endsWith(digits.slice(-10));
  }
  const needle = q.trim().toLowerCase();
  if (needle.length === 0) return false;
  const name = b.customer.name.toLowerCase();
  return name.startsWith(needle) || name.split(/\s+/).some((w) => w.startsWith(needle));
}

async function toMatch(b: BookingDocument): Promise<CheckInMatch> {
  const staff = await staffRepo.findStaffById(b.staffId);
  return {
    id: b._id,
    startAt: b.startAt.toISOString(),
    name: maskName(b.customer.name),
    staffName: staff?.name ?? 'Barber',
    chairNumber: staff?.chairNumber ?? null,
    arrived: b.arrivedAt !== null,
  };
}

/** Today's confirmed bookings in scope that match, soonest first, masked. */
export async function lookupToday(scope: Scope, q: string, now: Date): Promise<CheckInMatch[]> {
  const bounds = shopDayBounds(shopDateOf(now));
  const today = await bookingsRepo.listBookingsStartingBetween(bounds);
  const hits = today
    .filter((b) => b.status === 'confirmed')
    .filter((b) => scope.kind === 'all' || scope.staffId === b.staffId)
    .filter((b) => matchesQuery(b, q))
    .slice(0, MAX_MATCHES);
  return Promise.all(hits.map(toMatch));
}

/** The tap: marks the booking arrived through the same audited stamp the dashboard uses. */
export async function arriveFromCheckIn(
  principal: Principal,
  scope: Scope,
  id: string,
  meta: ServiceMeta,
): Promise<CheckInMatch> {
  const { booking } = await stampBookingMoment(principal, scope, id, 'arrived', meta);
  assertInScope(scope, booking.staff.id);
  const staff = await staffRepo.findStaffById(booking.staff.id);
  return {
    id: booking.id,
    startAt: booking.startAt,
    name: maskName(booking.customer.name),
    staffName: booking.staff.name,
    chairNumber: staff?.chairNumber ?? null,
    arrived: booking.arrivedAt !== null,
  };
}
