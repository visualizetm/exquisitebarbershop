import { Navigate, Route, Routes } from 'react-router';
import Calendar from '@untitled-ui/icons-react/build/esm/Calendar';
import ClipboardCheck from '@untitled-ui/icons-react/build/esm/ClipboardCheck';
import Clock from '@untitled-ui/icons-react/build/esm/Clock';
import User01 from '@untitled-ui/icons-react/build/esm/User01';
import { BottomTabs, ErrorState } from '@/components/ui';
import { Status } from '@/components/Status';
import '@/styles/dashboard.css';
import '@/styles/team.css';
import { MePage } from './MePage';
import { SetupPage } from './SetupPage';
import { SignIn } from './SignIn';
import { TeamSessionProvider } from './session';
import { useTeamSession } from './useTeamSession';
import { TimeOffPage } from './TimeOffPage';
import { TodayPage } from './TodayPage';
import { WeekPage } from './WeekPage';

const ICON = { 'aria-hidden': true } as const;

/**
 * The barber portal, phone first. Loaded as its own chunk so the public site never downloads
 * it. One address for the whole shop; the sign-in screen asks who you are, then your PIN.
 */
export default function TeamApp() {
  return (
    <TeamSessionProvider>
      <Routes>
        <Route path="setup/:token" element={<SetupPage />} />
        <Route path="*" element={<Gate />} />
      </Routes>
    </TeamSessionProvider>
  );
}

function Gate() {
  const { state } = useTeamSession();
  if (state.status === 'loading') {
    return (
      <div className="exq-team-center" data-state="loading">
        <Status state="loading" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="exq-team-center" data-state="error">
        <ErrorState title="The portal did not load">Check the connection and reload.</ErrorState>
      </div>
    );
  }
  if (state.status === 'signedOut') return <SignIn />;
  return (
    <div className="exq-team" data-state="ready">
      <main id="exq-team-main" className="exq-team-main" tabIndex={-1}>
        <Routes>
          <Route index element={<TodayPage />} />
          <Route path="week" element={<WeekPage />} />
          <Route path="time-off" element={<TimeOffPage />} />
          <Route path="me" element={<MePage />} />
          <Route path="*" element={<Navigate to="/team" replace />} />
        </Routes>
      </main>
      <BottomTabs
        label="Barber portal"
        portal
        items={[
          { label: 'Today', to: '/team', end: true, icon: <ClipboardCheck {...ICON} /> },
          { label: 'Week', to: '/team/week', icon: <Calendar {...ICON} /> },
          { label: 'Time off', to: '/team/time-off', icon: <Clock {...ICON} /> },
          { label: 'Me', to: '/team/me', icon: <User01 {...ICON} /> },
        ]}
      />
    </div>
  );
}
