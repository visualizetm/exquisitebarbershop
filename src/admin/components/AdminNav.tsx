import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { okResponseSchema } from '@shared/api/auth';
import { apiRequest } from '@/lib/api';
import { useMe, useSession } from '../useSession';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const OWNER_LINKS: NavItem[] = [
  { to: '/admin', label: 'Today', end: true },
  { to: '/admin/schedule', label: 'Schedule' },
  { to: '/admin/bookings/new', label: 'New booking' },
  { to: '/admin/bookings', label: 'Bookings', end: true },
  { to: '/admin/block', label: 'Block time' },
  { to: '/admin/whos-in', label: "Who's in" },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/audit', label: 'Audit log' },
  { to: '/admin/outbox', label: 'Email outbox' },
  { to: '/admin/account', label: 'Account' },
];

const BARBER_LINKS: NavItem[] = [
  { to: '/admin/me', label: 'My schedule' },
  { to: '/admin/account', label: 'Account' },
];

export function AdminNav() {
  const me = useMe();
  const { signedOut } = useSession();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
  const links = me.user.role === 'owner' ? OWNER_LINKS : BARBER_LINKS;

  async function logout() {
    setWorking(true);
    try {
      await apiRequest('/api/auth/logout', okResponseSchema, { method: 'POST', body: {} });
    } finally {
      setWorking(false);
      signedOut();
      void navigate('/admin/login', { replace: true });
    }
  }

  return (
    <header className="exq-adm-nav" data-state={me.user.role}>
      <p className="exq-adm-nav__who">
        Signed in as <span className="exq-adm-nav__email">{me.user.email}</span>
        {me.staff ? ` (${me.staff.name})` : ''}
      </p>
      <nav className="exq-adm-nav__menu" aria-label="Staff">
        <ul className="exq-adm-nav__list">
          {links.map((link) => (
            <li key={link.to} className="exq-adm-nav__item">
              <NavLink
                to={link.to}
                end={link.end ?? false}
                className="exq-adm-nav__link"
                data-state="idle"
              >
                {({ isActive }) => (
                  <span data-state={isActive ? 'active' : 'idle'}>{link.label}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <button
        type="button"
        className="exq-adm-nav__logout"
        data-state={working ? 'working' : 'idle'}
        disabled={working}
        onClick={() => void logout()}
      >
        Sign out
      </button>
    </header>
  );
}
