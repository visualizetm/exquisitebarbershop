export type SectionId =
  | 'announcement'
  | 'top'
  | 'offer'
  | 'work'
  | 'reviews'
  | 'hours'
  | 'services'
  | 'team'
  | 'gallery'
  | 'visit';

export interface Section {
  id: SectionId;
  label: string;
  group: 'Home page' | 'Shop info';
  /** The public page this section changes. */
  path: string;
}

export const SECTIONS: Section[] = [
  { id: 'announcement', label: 'Announcement bar', group: 'Home page', path: '/' },
  { id: 'top', label: 'Top of page', group: 'Home page', path: '/' },
  { id: 'offer', label: 'Launch offer', group: 'Home page', path: '/book' },
  { id: 'work', label: 'The work', group: 'Home page', path: '/' },
  { id: 'reviews', label: 'Reviews', group: 'Home page', path: '/' },
  { id: 'hours', label: 'Hours', group: 'Shop info', path: '/visit' },
  { id: 'services', label: 'Services and prices', group: 'Shop info', path: '/services' },
  { id: 'team', label: 'Team', group: 'Shop info', path: '/chairs' },
  { id: 'gallery', label: 'Gallery', group: 'Shop info', path: '/gallery' },
  { id: 'visit', label: 'Visit, map and contact', group: 'Shop info', path: '/visit' },
];

/** The old tab addresses, kept forever: /admin/website/:tab lands on the editor's section. */
export const OLD_TAB_SECTIONS: Record<string, SectionId> = {
  announcement: 'announcement',
  top: 'top',
  photo: 'top',
  hours: 'hours',
  services: 'services',
  gallery: 'gallery',
  reviews: 'reviews',
  team: 'team',
};
