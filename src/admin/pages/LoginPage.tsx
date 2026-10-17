import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { meResponseSchema } from '@shared/api/auth';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { useSession } from '../useSession';

/** Only paths inside the staff area are allowed as a return target. */
function safeNext(value: string | null): string {
  if (value?.startsWith('/admin') && !value.startsWith('//') && !value.includes('\\')) return value;
  return '/admin';
}

export function LoginPage() {
  usePageTitle('Staff sign in');
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await apiRequest('/api/auth/login', meResponseSchema, {
        method: 'POST',
        body: { email, password },
      });
      setPassword('');
      await refresh();
      void navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ACCOUNT_LOCKED') {
        setError(err.message);
      } else if (err instanceof ApiRequestError && err.code === 'RATE_LIMITED') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (err instanceof ApiRequestError && err.status === 401) {
        setError('Email or password is incorrect.');
      } else {
        setError('Could not sign in. Please try again.');
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <article className="exq-adm-login" data-state={working ? 'working' : error ? 'error' : 'idle'}>
      <h1 className="exq-adm-login__title">Staff sign in</h1>
      <form className="exq-adm-login__form" onSubmit={(e) => void submit(e)}>
        <p className="exq-adm-login__field">
          <label htmlFor="exq-adm-login-email">Email</label>
          <input
            id="exq-adm-login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </p>
        <p className="exq-adm-login__field">
          <label htmlFor="exq-adm-login-password">Password</label>
          <input
            id="exq-adm-login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </p>
        {error ? (
          <p className="exq-adm-login__error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="exq-adm-login__submit" disabled={working}>
          {working ? 'Signing in' : 'Sign in'}
        </button>
      </form>
    </article>
  );
}
