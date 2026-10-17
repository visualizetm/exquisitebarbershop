import { useState } from 'react';
import { useNavigate } from 'react-router';
import { logoutAllResponseSchema } from '@shared/api/auth';
import { ThemeSwitch } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorNote } from '../components/ErrorNote';
import { useMe, useSession } from '../useSession';
import { ChangePasswordPage } from './ChangePasswordPage';

export function AccountPage() {
  usePageTitle('Account');
  const me = useMe();
  const { signedOut } = useSession();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function logoutEverywhere() {
    setWorking(true);
    setError(null);
    try {
      await apiRequest('/api/auth/logout-all', logoutAllResponseSchema, {
        method: 'POST',
        body: {},
      });
      signedOut();
      void navigate('/admin/login', { replace: true });
    } catch (err) {
      setError(err);
      setWorking(false);
    }
  }

  return (
    <article className="exq-adm-account" data-state={working ? 'working' : 'idle'}>
      <h1 className="exq-adm-account__title">Account</h1>
      <dl className="exq-adm-account__facts">
        <dt>Email</dt>
        <dd>{me.user.email}</dd>
        <dt>Role</dt>
        <dd>{me.user.role === 'owner' ? 'Owner' : 'Barber'}</dd>
        {me.staff ? (
          <>
            <dt>Chair</dt>
            <dd>{me.staff.name}</dd>
          </>
        ) : null}
      </dl>
      <section className="exq-adm-account__theme" aria-labelledby="exq-adm-account-theme">
        <h2 id="exq-adm-account-theme">Appearance</h2>
        <p>System follows your phone or computer. Light and Dark stay put.</p>
        <ThemeSwitch />
      </section>
      <ChangePasswordPage />
      <section className="exq-adm-account__sessions" aria-labelledby="exq-adm-account-sessions">
        <h2 id="exq-adm-account-sessions">Sign out everywhere</h2>
        <p>Ends every session of this login, including this one. Use it if a device was lost.</p>
        <ErrorNote error={error} />
        <button
          type="button"
          className="exq-adm-account__logout-all"
          disabled={working}
          onClick={() => void logoutEverywhere()}
        >
          Sign out on every device
        </button>
      </section>
    </article>
  );
}
