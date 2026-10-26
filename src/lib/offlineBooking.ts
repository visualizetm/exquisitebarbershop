import type { PublicStaff } from '@shared/api/public';

/**
 * A chair that takes no online bookings sends people to the barber's Instagram instead of a Book
 * button. Without an Instagram handle it says walk-ins only. Null for a chair that books online.
 */
export function offlineBooking(
  member: Pick<PublicStaff, 'acceptsOnlineBooking' | 'instagramHandle'>,
): { label: string; href: string | null } | null {
  if (member.acceptsOnlineBooking) return null;
  return member.instagramHandle
    ? {
        label: 'Book through Instagram',
        href: `https://instagram.com/${member.instagramHandle}`,
      }
    : { label: 'Walk-ins only', href: null };
}
