import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import BarChart01 from '@untitled-ui/icons-react/build/esm/BarChart01';
import Calendar from '@untitled-ui/icons-react/build/esm/Calendar';
import ClipboardCheck from '@untitled-ui/icons-react/build/esm/ClipboardCheck';
import DotsHorizontal from '@untitled-ui/icons-react/build/esm/DotsHorizontal';
import LogOut01 from '@untitled-ui/icons-react/build/esm/LogOut01';
import Menu01 from '@untitled-ui/icons-react/build/esm/Menu01';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import { okResponseSchema } from '@shared/api/auth';
import {
  BottomTabs,
  Button,
  IconButton,
  Mark,
  Sheet,
  Sidebar,
  ThemeMenu,
  ThemeSwitch,
} from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { todayInShop, shopDateLabel } from '../format';
import { NewBookingPage } from '../pages/NewBookingPage';
import { useMe, useSession } from '../useSession';
import { GlobalSearch } from './GlobalSearch';
import { ICON, OWNER_ITEMS } from './ownerNav';
import { QuickContext, type NewBookingPrefill, type QuickApi } from './quick';

/**
 * The owner dashboard frame: the ink sidebar from 1024px, a top bar with search, today's date
 * and New booking on every page, and a four tab bar with a menu sheet below that. It also owns
 * the side panels any page can open (see QuickApi).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { signedOut } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [newOpen, setNewOpen] = useState<NewBookingPrefill | null>(null);
  const [version, setVersion] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const changed = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);
  const api = useMemo<QuickApi>(
    () => ({
      openNewBooking: (prefill = {}) => {
        setNewOpen(prefill);
      },
      openBooking: (id) => {
        void navigate(`/admin/bookings/${id}`);
      },
      closeBooking: () => {
        void navigate('/admin/bookings');
      },
      version,
      changed,
    }),
    [navigate, version, changed],
  );

  async function logout() {
    setLeaving(true);
    try {
      await apiRequest('/api/auth/logout', okResponseSchema, { method: 'POST', body: {} });
    } finally {
      setLeaving(false);
      signedOut();
      void navigate('/admin/login', { replace: true });
    }
  }

  const name = me.staff?.name ?? me.user.email;
  const signOut = (
    <Button
      variant="onink"
      size="sm"
      icon={<LogOut01 aria-hidden="true" />}
      loading={leaving}
      onClick={() => void logout()}
    >
      Sign out
    </Button>
  );

  return (
    <QuickContext.Provider value={api}>
      <div className="exq-shell" data-state="owner">
        <Sidebar
          label="Dashboard"
          logo={
            <Link to="/admin" aria-label="Exquisite dashboard, overview">
              <Mark name="stacked" alt="" width={190} height={44} />
            </Link>
          }
          items={OWNER_ITEMS}
          footer={
            <>
              <p className="exq-sidebar__who">
                {name}
                <span className="exq-sidebar__role"> Owner</span>
              </p>
              <div className="exq-sidebar__actions">
                <ThemeMenu />
                {signOut}
              </div>
            </>
          }
        />
        <div className="exq-shell__main">
          <header className="exq-topbar">
            <IconButton
              className="exq-topbar__menu"
              label="Menu"
              icon={<Menu01 aria-hidden="true" />}
              onClick={() => {
                setMenuOpen(true);
              }}
            />
            <Link to="/admin" className="exq-topbar__brand" aria-label="Overview">
              <Mark name="disc" alt="" width={28} height={28} />
            </Link>
            <div className="exq-topbar__search">
              <GlobalSearch />
            </div>
            <span className="exq-topbar__spacer" />
            <span className="exq-topbar__date">{shopDateLabel(todayInShop())}</span>
            <Button
              className="exq-topbar__new"
              size="sm"
              icon={<Plus aria-hidden="true" />}
              aria-label="New booking"
              onClick={() => {
                setNewOpen({});
              }}
            >
              New booking
            </Button>
          </header>
          <div
            className="exq-shell__content exq-adm exq-adm__content"
            key={location.pathname.split('/')[2] ?? 'overview'}
          >
            {children}
          </div>
        </div>

        <BottomTabs
          label="Dashboard, mobile"
          items={[
            { to: '/admin', label: 'Overview', icon: <BarChart01 {...ICON} />, end: true },
            { to: '/admin/bookings', label: 'Bookings', icon: <ClipboardCheck {...ICON} /> },
            { to: '/admin/schedule', label: 'Schedule', icon: <Calendar {...ICON} /> },
            {
              label: 'More',
              icon: <DotsHorizontal {...ICON} />,
              active: menuOpen,
              onClick: () => {
                setMenuOpen(true);
              },
            },
          ]}
        />

        <Sheet
          open={menuOpen}
          title="Menu"
          onClose={() => {
            setMenuOpen(false);
          }}
        >
          <ul className="exq-menusheet exq-bare">
            {OWNER_ITEMS.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="exq-menusheet__link"
                  onClick={() => {
                    setMenuOpen(false);
                  }}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <ThemeSwitch />
          <p className="exq-menusheet__who">
            {name} <span className="exq-muted">Owner</span>
          </p>
          <Button
            variant="outline"
            icon={<LogOut01 aria-hidden="true" />}
            loading={leaving}
            onClick={() => void logout()}
          >
            Sign out
          </Button>
        </Sheet>

        <Sheet
          open={newOpen !== null}
          title="New booking"
          size="lg"
          onClose={() => {
            setNewOpen(null);
          }}
        >
          <div className="exq-adm">
            <NewBookingPage embedded />
          </div>
        </Sheet>
      </div>
    </QuickContext.Provider>
  );
}
