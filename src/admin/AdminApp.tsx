import { Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { Status } from '@/components/Status';
import { DemoBanner } from '@/components/site/DemoBanner';
import '@/styles/admin.css';
import '@/styles/dashboard.css';
import { AuditPage } from './pages/AuditPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { CustomersPage } from './customers/CustomersPage';
import { LoginPage } from './pages/LoginPage';
import { OutboxPage } from './pages/OutboxPage';
import { SchedulePage } from './schedule/SchedulePage';
import { SettingsPage } from './settings/SettingsPage';
import { WebsitePage } from './website/WebsitePage';
import { BookingsPage } from './bookings/BookingsPage';
import { OverviewPage } from './overview/OverviewPage';
import { TeamDetailPage } from './team/TeamDetailPage';
import { TeamPage } from './team/TeamPage';
import { AdminShell } from './shell/AdminShell';
import { SIDE_HOME, loadSide } from './shell/ownerNav';
import { SessionProvider } from './session';
import { useSession } from './useSession';

/**
 * The whole staff area. Loaded as its own chunk so public visitors never
 * download it. Every screen sits behind the sign-in gate; the server checks
 * the role again on every request, so hiding links here is only for clarity.
 */
export default function AdminApp() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  );
}

function Gate() {
  const { state } = useSession();
  const location = useLocation();
  const onLogin = location.pathname === '/admin/login';

  if (state.status === 'loading') {
    return (
      <div className="exq-adm" data-state="loading">
        <Status state="loading" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="exq-adm" data-state="error">
        <Status state="error" message={state.message} />
      </div>
    );
  }
  if (state.status === 'signedOut') {
    if (onLogin) return <LoginPage />;
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/admin/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (state.me.user.mustChangePassword) {
    return (
      <div className="exq-adm" data-state="password-change">
        <ChangePasswordPage forced />
      </div>
    );
  }
  if (onLogin) return <Navigate to="/admin" replace />;

  if (state.me.user.role === 'owner') {
    return (
      <AdminShell>
        {state.me.features.demo ? <DemoBanner /> : null}
        <OwnerRoutes />
      </AdminShell>
    );
  }
  // Barbers sign in with a PIN at /team. A barber login cannot open a session here at all, so this
  // is only reached by a session that predates the PIN portal.
  return (
    <div className="exq-adm" data-state="barber">
      <p>
        Barbers sign in at <a href="/team">/team</a> with a PIN.
      </p>
    </div>
  );
}

/** An old address: the same page under its new home, keeping the rest of the path and the query. */
function Moved({ to }: { to: string }) {
  const { '*': rest = '' } = useParams();
  const { search } = useLocation();
  return <Navigate to={`${to}${rest ? `/${rest}` : ''}${search}`} replace />;
}

/** /admin/website?tab=photo and friends become /admin/website/top and friends. */
const OLD_WEBSITE_TABS: Record<string, string> = {
  hours: 'hours',
  announcement: 'announcement',
  services: 'services',
  photo: 'top',
  gallery: 'gallery',
  reviews: 'reviews',
};
function WebsiteHome() {
  const params = new URLSearchParams(useLocation().search);
  const tab = OLD_WEBSITE_TABS[params.get('tab') ?? ''];
  return <Navigate to={tab ? `/admin/website/${tab}` : SIDE_HOME.website} replace />;
}

/** /admin lands on the side this device used last, Shop by default. */
function Home() {
  return <Navigate to={SIDE_HOME[loadSide()]} replace />;
}

function OwnerRoutes() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="shop">
        <Route index element={<Navigate to="/admin/shop/today" replace />} />
        <Route path="today" element={<OverviewPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="bookings/:id" element={<BookingsPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="clients" element={<CustomersPage />} />
        <Route path="clients/:phone" element={<CustomersPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="team/:id" element={<TeamDetailPage />} />
        <Route path="*" element={<Navigate to="/admin/shop/today" replace />} />
      </Route>
      <Route path="website">
        <Route index element={<WebsiteHome />} />
        <Route path=":tab" element={<WebsitePage />} />
      </Route>
      <Route path="settings" element={<SettingsPage />} />
      <Route path="settings/*" element={<Navigate to="/admin/settings" replace />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="outbox" element={<OutboxPage />} />
      <Route path="account" element={<Navigate to="/admin/settings?tab=account" replace />} />
      {/* Old addresses keep working: bookmarks, the guide and the printed cards never break. */}
      <Route path="overview" element={<Navigate to="/admin/shop/today" replace />} />
      <Route path="today" element={<Navigate to="/admin/shop/today" replace />} />
      <Route path="bookings/*" element={<Moved to="/admin/shop/bookings" />} />
      <Route path="schedule/*" element={<Moved to="/admin/shop/schedule" />} />
      <Route path="customers/*" element={<Moved to="/admin/shop/clients" />} />
      <Route path="clients/*" element={<Moved to="/admin/shop/clients" />} />
      <Route path="team/*" element={<Moved to="/admin/shop/team" />} />
      <Route path="staff/*" element={<Moved to="/admin/shop/team" />} />
      <Route path="photos" element={<Navigate to="/admin/website/gallery" replace />} />
      <Route path="hours" element={<Navigate to="/admin/website/hours" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
