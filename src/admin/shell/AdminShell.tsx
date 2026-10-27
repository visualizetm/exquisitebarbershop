import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DateTime } from 'luxon';
import { Link, matchPath, useLocation, useNavigate } from 'react-router';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import { okResponseSchema } from '@shared/api/auth';
import { SHOP_TIMEZONE } from '@shared/lib/constants';
import { Button, ButtonLink, Mark, NavLink, Sheet } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { NewBookingFlow, type FlowIntent } from '@/booking-flow/NewBookingFlow';
import { BookingSheet } from '../bookings/BookingSheet';
import { AnnouncementPanel } from '../panels/AnnouncementPanel';
import { BarberOutPanel } from '../panels/BarberOutPanel';
import { AlertPanel } from '../panels/AlertPanel';
import { BlockTimePanel } from '../panels/BlockTimePanel';
import { useMe, useSession } from '../useSession';
import { GlobalSearch } from './GlobalSearch';
import {
  SHOP_TABS,
  SIDE_HOME,
  WEBSITE_TABS,
  loadSide,
  saveSide,
  sideOf,
  type Side,
} from './ownerNav';
import { QuickContext, type NewBookingPrefill, type QuickApi } from './quick';

type Panel =
  | { kind: 'block'; staffId?: string | undefined; blockKind?: 'block' | 'timeOff' | undefined }
  | { kind: 'alert'; id: string }
  | { kind: 'out'; staffId?: string | undefined }
  | { kind: 'announcement' };

const PANEL_TITLE: Record<Panel['kind'], string> = {
  block: 'Block time',
  out: 'Barber out',
  announcement: 'Announcement',
  alert: 'Needs a decision',
};

const SIDE_LABEL: Record<Side, string> = { shop: 'Shop', website: 'Website' };

const ACCOUNT_LINKS = [
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/audit', label: 'Audit log' },
  { to: '/admin/outbox', label: 'Outbox' },
  { to: '/admin/settings?tab=account', label: 'Change password' },
];

/** "Mon, Oct 26 · 2:14 PM" in shop time, kept current to the minute. */
function useShopClock(): string {
  const read = () => DateTime.now().setZone(SHOP_TIMEZONE).toFormat('ccc, LLL d · h:mm a');
  const [label, setLabel] = useState(read);
  useEffect(() => {
    const tick = () => {
      setLabel(read());
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return label;
}

/** Shop | Website. The chosen side is remembered on this device. */
function SideSwitch({
  side,
  onPick,
  className,
}: {
  side: Side;
  onPick: (side: Side) => void;
  className: string;
}) {
  return (
    <div className={`exq-seg exq-side ${className}`} role="group" aria-label="Dashboard side">
      {(['shop', 'website'] as const).map((s) => (
        <button
          key={s}
          type="button"
          className="exq-seg__btn"
          data-state={s === side ? 'selected' : 'idle'}
          aria-pressed={s === side}
          onClick={() => {
            onPick(s);
          }}
        >
          {SIDE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/**
 * The owner dashboard frame: a dark top bar (logo, Shop | Website, search, the clock, New
 * booking, the account menu) and the section tabs of the chosen side under it. No side menu.
 * It also owns the side panels any page can open (see QuickApi).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { signedOut } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [flow, setFlow] = useState<FlowIntent | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const clock = useShopClock();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);

  // The side follows the address; on the account pages (Settings, Audit, Outbox) it is the
  // remembered one, so the tabs row still shows where Back would land.
  const [savedSide, setSavedSide] = useState<Side>(loadSide);
  const pathSide = sideOf(location.pathname);
  const side = pathSide ?? savedSide;
  useEffect(() => {
    if (pathSide && pathSide !== savedSide) {
      saveSide(pathSide);
      setSavedSide(pathSide);
    }
  }, [pathSide, savedSide]);
  const pickSide = useCallback(
    (next: Side) => {
      saveSide(next);
      setSavedSide(next);
      if (next !== pathSide) void navigate(SIDE_HOME[next]);
    },
    [navigate, pathSide],
  );

  const changed = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);
  // On the bookings pages the open booking lives in the address (/admin/shop/bookings/:id), so a
  // link to one works and the back button closes it. Anywhere else it is plain state.
  const routeId = matchPath('/admin/shop/bookings/:id', location.pathname)?.params.id ?? null;
  const onBookings = location.pathname.startsWith('/admin/shop/bookings');
  const activeBookingId = routeId ?? bookingId;
  const api = useMemo<QuickApi>(
    () => ({
      openNewBooking: (prefill: NewBookingPrefill = {}) => {
        if (prefill.move) setFlow({ kind: 'move', booking: prefill.move });
        else if (prefill.reschedule) setFlow({ kind: 'reschedule', booking: prefill.reschedule });
        else
          setFlow({
            kind: 'new',
            ...(prefill.staffId ? { staffId: prefill.staffId } : {}),
            ...(prefill.startAt ? { startAt: prefill.startAt } : {}),
            now: prefill.source === 'walkIn',
          });
      },
      openBooking: (id) => {
        if (onBookings) void navigate(`/admin/shop/bookings/${id}${location.search}`);
        else setBookingId(id);
      },
      closeBooking: () => {
        setBookingId(null);
        if (routeId) void navigate(`/admin/shop/bookings${location.search}`);
      },
      openBlock: (options) => {
        setPanel({ kind: 'block', staffId: options?.staffId, blockKind: options?.kind });
      },
      openAlert: (id) => {
        setPanel({ kind: 'alert', id });
      },
      openBarberOut: (staffId) => {
        setPanel({ kind: 'out', staffId });
      },
      openAnnouncement: () => {
        setPanel({ kind: 'announcement' });
      },
      version,
      changed,
    }),
    [navigate, version, changed, onBookings, routeId, location.search],
  );

  // The account menu closes on a pick, on Escape and on a tap outside.
  const closeAccount = useCallback(() => {
    setAccountOpen(false);
  }, []);
  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

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
  const initial = (name.trim()[0] ?? 'E').toUpperCase();
  const tabs = side === 'shop' ? SHOP_TABS : WEBSITE_TABS;

  return (
    <QuickContext.Provider value={api}>
      <div className="exq-shell" data-state="owner" data-side={side}>
        <header className="exq-topbar">
          <Link to={SIDE_HOME[side]} className="exq-topbar__logo" aria-label="Exquisite dashboard">
            <Mark name="stacked" alt="" width={155} height={36} />
          </Link>
          <SideSwitch side={side} onPick={pickSide} className="exq-topbar__side" />
          <div className="exq-topbar__search">
            <GlobalSearch />
          </div>
          <span className="exq-topbar__spacer" />
          <span className="exq-topbar__date exq-label">{clock}</span>
          <ButtonLink
            to="/admin/checkin"
            variant="outline"
            size="sm"
            className="exq-topbar__checkin"
          >
            Check in
          </ButtonLink>
          <Button
            className="exq-topbar__new"
            variant="accent"
            size="sm"
            icon={<Plus aria-hidden="true" />}
            aria-label="New booking"
            onClick={() => {
              setFlow({ kind: 'new' });
            }}
          >
            New booking
          </Button>
          <div ref={accountRef} className="exq-acct" data-state={accountOpen ? 'open' : 'closed'}>
            <button
              ref={accountButtonRef}
              type="button"
              className="exq-acct__button"
              aria-label={`Account menu, ${name}`}
              aria-haspopup="true"
              aria-expanded={accountOpen}
              onClick={() => {
                setAccountOpen((o) => !o);
              }}
            >
              <span className="exq-acct__initial" aria-hidden="true">
                {initial}
              </span>
            </button>
            {accountOpen ? (
              <div className="exq-acct__menu">
                <p className="exq-acct__who">
                  {name}
                  <span className="exq-acct__role">Owner</span>
                </p>
                <ul className="exq-bare exq-acct__list">
                  {ACCOUNT_LINKS.map((item) => (
                    <li key={item.label}>
                      <Link to={item.to} className="exq-acct__link" onClick={closeAccount}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  size="sm"
                  block
                  loading={leaving}
                  onClick={() => void logout()}
                >
                  Sign out
                </Button>
              </div>
            ) : null}
          </div>
        </header>
        <div className="exq-sectabs">
          <SideSwitch side={side} onPick={pickSide} className="exq-sectabs__side" />
          <nav className="exq-sectabs__nav" aria-label={`${SIDE_LABEL[side]} sections`}>
            {tabs.map((tab) => (
              <NavLink key={tab.to} to={tab.to} className="exq-sectabs__tab">
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div
          className="exq-shell__content exq-adm exq-adm__content"
          key={location.pathname.split('/').slice(2, 4).join('/') || 'home'}
        >
          {children}
        </div>

        <Sheet
          open={panel !== null}
          title={panel ? PANEL_TITLE[panel.kind] : ''}
          size="md"
          onClose={() => {
            setPanel(null);
          }}
        >
          <div className="exq-panelhost">
            {panel?.kind === 'block' ? (
              <BlockTimePanel
                {...(panel.staffId ? { staffId: panel.staffId } : {})}
                {...(panel.blockKind ? { initialKind: panel.blockKind } : {})}
                onDone={() => {
                  setPanel(null);
                }}
              />
            ) : null}
            {panel?.kind === 'alert' ? (
              <AlertPanel
                id={panel.id}
                onDone={() => {
                  setPanel(null);
                }}
              />
            ) : null}
            {panel?.kind === 'out' ? (
              <BarberOutPanel
                {...(panel.staffId ? { staffId: panel.staffId } : {})}
                onDone={() => {
                  setPanel(null);
                }}
              />
            ) : null}
            {panel?.kind === 'announcement' ? (
              <AnnouncementPanel
                onDone={() => {
                  setPanel(null);
                }}
              />
            ) : null}
          </div>
        </Sheet>

        <NewBookingFlow
          open={flow !== null}
          session="owner"
          intent={flow ?? { kind: 'new' }}
          onClose={() => {
            setFlow(null);
          }}
          onDone={(result) => {
            changed();
            if (result.kind === 'booking' && flow?.kind !== 'new') api.closeBooking();
          }}
        />

        <Sheet open={activeBookingId !== null} title="Booking" size="lg" onClose={api.closeBooking}>
          <div className="exq-panelhost">
            {activeBookingId ? <BookingSheet key={activeBookingId} id={activeBookingId} /> : null}
          </div>
        </Sheet>
      </div>
    </QuickContext.Provider>
  );
}
