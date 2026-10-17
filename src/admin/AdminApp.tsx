import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Status } from '@/components/Status';
import { AdminNav } from './components/AdminNav';
import { AccountPage } from './pages/AccountPage';
import { AuditPage } from './pages/AuditPage';
import { BlockTimePage } from './pages/BlockTimePage';
import { BookingDetailPage } from './pages/BookingDetailPage';
import { BookingsPage } from './pages/BookingsPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { CustomersPage } from './pages/CustomersPage';
import { LoginPage } from './pages/LoginPage';
import { MySchedulePage } from './pages/MySchedulePage';
import { NewBookingPage } from './pages/NewBookingPage';
import { OutboxPage } from './pages/OutboxPage';
import { SchedulePage } from './pages/SchedulePage';
import { TodayPage } from './pages/TodayPage';
import { WhosInPage } from './pages/WhosInPage';
import { SettingsPage } from './pages/settings/SettingsPage';
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

  const isOwner = state.me.user.role === 'owner';
  return (
    <div className="exq-adm" data-state={isOwner ? 'owner' : 'barber'}>
      <AdminNav />
      <div className="exq-adm__content">{isOwner ? <OwnerRoutes /> : <BarberRoutes />}</div>
    </div>
  );
}

function OwnerRoutes() {
  return (
    <Routes>
      <Route index element={<TodayPage />} />
      <Route path="schedule" element={<SchedulePage />} />
      <Route path="bookings" element={<BookingsPage />} />
      <Route path="bookings/new" element={<NewBookingPage />} />
      <Route path="bookings/:id" element={<BookingDetailPage />} />
      <Route path="block" element={<BlockTimePage />} />
      <Route path="whos-in" element={<WhosInPage />} />
      <Route path="customers" element={<CustomersPage />} />
      <Route path="settings/*" element={<SettingsPage />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="outbox" element={<OutboxPage />} />
      <Route path="account" element={<AccountPage />} />
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
