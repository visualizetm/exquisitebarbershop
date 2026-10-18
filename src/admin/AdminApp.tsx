import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Status } from '@/components/Status';
import { DemoBanner } from '@/components/site/DemoBanner';
import '@/styles/admin.css';
import '@/styles/dashboard.css';
import { AdminNav } from './components/AdminNav';
import { AccountPage } from './pages/AccountPage';
import { AuditPage } from './pages/AuditPage';
import { BookingDetailPage } from './pages/BookingDetailPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { CustomersPage } from './customers/CustomersPage';
import { LoginPage } from './pages/LoginPage';
import { LoginsSettings } from './pages/settings/LoginsSettings';
import { MySchedulePage } from './pages/MySchedulePage';
import { OutboxPage } from './pages/OutboxPage';
import { SchedulePage } from './schedule/SchedulePage';
import { SettingsPage } from './settings/SettingsPage';
import { WebsitePage } from './website/WebsitePage';
import { BookingsPage } from './bookings/BookingsPage';
import { OverviewPage } from './overview/OverviewPage';
import { TeamDetailPage } from './team/TeamDetailPage';
import { TeamPage } from './team/TeamPage';
import { AdminShell } from './shell/AdminShell';
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
  return (
    <div className="exq-adm" data-state="barber">
      <AdminNav />
      <div className="exq-adm__content">
        {state.me.features.demo ? <DemoBanner /> : null}
        <BarberRoutes />
      </div>
    </div>
  );
}

function OwnerRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="schedule" element={<SchedulePage />} />
      <Route path="bookings" element={<BookingsPage />} />
      <Route path="bookings/:id" element={<BookingsPage />} />
      <Route path="team" element={<TeamPage />} />
      <Route path="team/:id" element={<TeamDetailPage />} />
      <Route path="website" element={<WebsitePage />} />
      <Route path="customers" element={<CustomersPage />} />
      <Route path="customers/:phone" element={<CustomersPage />} />
      <Route path="photos" element={<Navigate to="/admin/website?tab=gallery" replace />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="settings/logins" element={<LoginsSettings />} />
      <Route path="settings/*" element={<Navigate to="/admin/settings" replace />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="outbox" element={<OutboxPage />} />
      <Route path="account" element={<Navigate to="/admin/settings?tab=account" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

function BarberRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/admin/me" replace />} />
      <Route path="me" element={<MySchedulePage />} />
      <Route path="me/bookings/:id" element={<BookingDetailPage mine />} />
      <Route path="account" element={<AccountPage />} />
      <Route path="*" element={<Navigate to="/admin/me" replace />} />
    </Routes>
  );
}
