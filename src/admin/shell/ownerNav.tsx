/** The two sides of the owner dashboard and the section tabs under the top bar. */
export type Side = 'shop' | 'website';

export interface SectionTab {
  to: string;
  label: string;
}

export const SHOP_TABS: SectionTab[] = [
  { to: '/admin/shop/today', label: 'Today' },
  { to: '/admin/shop/bookings', label: 'Bookings' },
  { to: '/admin/shop/schedule', label: 'Schedule' },
  { to: '/admin/shop/clients', label: 'Clients' },
  { to: '/admin/shop/team', label: 'Team' },
];

export const WEBSITE_TABS: SectionTab[] = [
  { to: '/admin/website/announcement', label: 'Announcement' },
  { to: '/admin/website/top', label: 'Top of page' },
  { to: '/admin/website/hours', label: 'Hours' },
  { to: '/admin/website/services', label: 'Services and prices' },
  { to: '/admin/website/gallery', label: 'Gallery' },
  { to: '/admin/website/reviews', label: 'Reviews' },
];

export const SIDE_HOME: Record<Side, string> = {
  shop: '/admin/shop/today',
  website: '/admin/website/announcement',
};

const SIDE_KEY = 'exq-admin-side';

/** The side the owner last used on this device; Shop until they switch. */
export function loadSide(): Side {
  try {
    return localStorage.getItem(SIDE_KEY) === 'website' ? 'website' : 'shop';
  } catch {
    return 'shop';
  }
}

export function saveSide(side: Side): void {
  try {
    localStorage.setItem(SIDE_KEY, side);
  } catch {
    // Storage blocked: the switch simply starts on Shop next time.
  }
}

/** Which side a path belongs to, or null for the account pages (Settings, Audit, Outbox). */
export function sideOf(pathname: string): Side | null {
  if (pathname.startsWith('/admin/website')) return 'website';
  if (pathname.startsWith('/admin/shop')) return 'shop';
  return null;
}
