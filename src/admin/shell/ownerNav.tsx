import BarChart01 from '@untitled-ui/icons-react/build/esm/BarChart01';
import Calendar from '@untitled-ui/icons-react/build/esm/Calendar';
import ClipboardCheck from '@untitled-ui/icons-react/build/esm/ClipboardCheck';
import Globe01 from '@untitled-ui/icons-react/build/esm/Globe01';
import Scissors01 from '@untitled-ui/icons-react/build/esm/Scissors01';
import Settings01 from '@untitled-ui/icons-react/build/esm/Settings01';
import Users01 from '@untitled-ui/icons-react/build/esm/Users01';
import type { SidebarItem } from '@/components/ui';

export const ICON = { 'aria-hidden': true } as const;

/** The seven areas of the owner dashboard, in sidebar order. */
export const OWNER_ITEMS: SidebarItem[] = [
  { to: '/admin', label: 'Overview', icon: <BarChart01 {...ICON} />, end: true },
  { to: '/admin/bookings', label: 'Bookings', icon: <ClipboardCheck {...ICON} /> },
  { to: '/admin/schedule', label: 'Schedule', icon: <Calendar {...ICON} /> },
  { to: '/admin/customers', label: 'Customers', icon: <Users01 {...ICON} /> },
  { to: '/admin/team', label: 'Team', icon: <Scissors01 {...ICON} /> },
  { to: '/admin/website', label: 'Website', icon: <Globe01 {...ICON} /> },
  { to: '/admin/settings', label: 'Settings', icon: <Settings01 {...ICON} /> },
];
