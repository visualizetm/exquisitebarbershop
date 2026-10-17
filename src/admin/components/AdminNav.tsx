import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import Calendar from '@untitled-ui/icons-react/build/esm/Calendar';
import DotsHorizontal from '@untitled-ui/icons-react/build/esm/DotsHorizontal';
import Home02 from '@untitled-ui/icons-react/build/esm/Home02';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import { okResponseSchema } from '@shared/api/auth';
import { Button, Sheet } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { NewBookingPage } from '../pages/NewBookingPage';
import { useMe, useSession } from '../useSession';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const OWNER_PRIMARY: NavItem[] = [
  { to: '/admin', label: 'Today', end: true },
  { to: '/admin/schedule', label: 'Schedule' },
];
const OWNER_MORE: NavItem[] = [
  { to: '/admin/bookings', label: 'Bookings', end: true },
  { to: '/admin/block', label: 'Block time' },
  { to: '/admin/whos-in', label: "Who's in" },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/photos', label: 'Photos' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/audit', label: 'Audit log' },
  { to: '/admin/outbox', label: 'Email outbox' },
  { to: '/admin/account', label: 'Account' },
];
const BARBER_LINKS: NavItem[] = [
  { to: '/admin/me', label: 'My schedule' },
  { to: '/admin/account', label: 'Account' },
];

function Item({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.end ?? false} className="exq-adm-nav__link">
      {({ isActive }) => <span data-state={isActive ? 'active' : 'idle'}>{item.label}</span>}
    </NavLink>
  );
}

/**
 * Owner: a bottom tab bar on phones (Today, Schedule, New, More) and a side
 * nav from 1024px. Barbers get My schedule and Account. "New" opens the
 * booking form as a sheet; the /admin/bookings/new route still works.
 */
export function AdminNav() {
  const me = useMe();
  const { signedOut } = useSession();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
  const [more, setMore] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const isOwner = me.user.role === 'owner';

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

  const who = (
    <p className="exq-adm-nav__who">
      <span className="exq-adm-nav__email">{me.user.email}</span>
      {me.staff ? <span className="exq-adm-nav__chair">{me.staff.name}</span> : null}
    </p>
  );
  const signOut = (
    <Button variant="secondary" size="sm" loading={working} onClick={() => void logout()}>
      Sign out
    </Button>
  );

  return (
    <header className="exq-adm-nav" data-state={me.user.role}>
      {/* Side nav, 1024px and up */}
      <nav className="exq-adm-nav__side" aria-label="Staff">
        <img
          className="exq-adm-nav__logo"
          src="/brand/exq-wordmark-black.svg"
          alt="Exquisite"
          width="200"
          height="38"
        />
        {who}
        <ul className="exq-adm-nav__list">
          {(isOwner ? [...OWNER_PRIMARY, ...OWNER_MORE] : BARBER_LINKS).map((item) => (
            <li key={item.to} className="exq-adm-nav__item">
              <Item item={item} />
            </li>
          ))}
        </ul>
        {isOwner ? (
          <Button
            size="sm"
            icon={<Plus aria-hidden="true" />}
            onClick={() => {
              setNewOpen(true);
            }}
          >
            New booking
          </Button>
        ) : null}
        <div className="exq-adm-nav__signout">{signOut}</div>
      </nav>

      {/* Tab bar, below 1024px */}
      <nav className="exq-adm-tabs" aria-label="Staff, mobile">
        {isOwner ? (
          <>
            <NavLink to="/admin" end className="exq-adm-tabs__tab">
              {({ isActive }) => (
                <span data-state={isActive ? 'active' : 'idle'}>
                  <Home02 aria-hidden="true" />
                  Today
                </span>
              )}
            </NavLink>
            <NavLink to="/admin/schedule" className="exq-adm-tabs__tab">
              {({ isActive }) => (
                <span data-state={isActive ? 'active' : 'idle'}>
                  <Calendar aria-hidden="true" />
                  Schedule
                </span>
              )}
            </NavLink>
            <button
              type="button"
              className="exq-adm-tabs__tab"
              onClick={() => {
                setNewOpen(true);
              }}
            >
              <span data-state={newOpen ? 'active' : 'idle'}>
                <Plus aria-hidden="true" />
                New
              </span>
            </button>
            <button
              type="button"
              className="exq-adm-tabs__tab"
              aria-expanded={more}
              onClick={() => {
                setMore(true);
              }}
            >
              <span data-state={more ? 'active' : 'idle'}>
                <DotsHorizontal aria-hidden="true" />
                More
              </span>
            </button>
          </>
        ) : (
          BARBER_LINKS.map((item) => (
            <NavLink key={item.to} to={item.to} className="exq-adm-tabs__tab">
              {({ isActive }) => (
                <span data-state={isActive ? 'active' : 'idle'}>
                  {item.to.endsWith('/me') ? (
                    <Calendar aria-hidden="true" />
                  ) : (
                    <DotsHorizontal aria-hidden="true" />
                  )}
                  {item.label}
                </span>
              )}
            </NavLink>
          ))
        )}
      </nav>

      <Sheet
        open={more}
        title="More"
        onClose={() => {
          setMore(false);
        }}
      >
        {who}
        <ul className="exq-adm-nav__list exq-adm-nav__list--sheet">
          {OWNER_MORE.map((item) => (
            <li
              key={item.to}
              className="exq-adm-nav__item"
              onClick={() => {
                setMore(false);
              }}
            >
              <Item item={item} />
            </li>
          ))}
        </ul>
        {signOut}
      </Sheet>

      <Sheet
        open={newOpen}
        title="New booking"
        size="lg"
        onClose={() => {
          setNewOpen(false);
        }}
      >
        <NewBookingPage embedded />
      </Sheet>
    </header>
  );
}
