import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { meResponseSchema } from '@shared/api/auth';
import { apiRequest } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorNote } from '../components/ErrorNote';
import { useSession } from '../useSession';

/**
 * Changing the password ends every other session of this login. When `forced`,
 * the login carries a temporary password and nothing else is reachable until
 * it is replaced.
 */
export function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  usePageTitle(forced ? 'Choose a new password' : null);
  const { refresh } = useSession();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== newPassword;

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (newPassword !== confirm) return;
    setWorking(true);
    setError(null);
    try {
      await apiRequest('/api/me/password', meResponseSchema, {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      className="exq-adm-password"
      data-state={
        working ? 'working' : done ? 'done' : error ? 'error' : forced ? 'forced' : 'idle'
      }
      aria-labelledby="exq-adm-password-title"
    >
      <h1 id="exq-adm-password-title" className="exq-adm-password__title">
        {forced ? 'Choose a new password' : 'Change password'}
      </h1>
      {forced ? (
        <p className="exq-adm-password__intro">
          You signed in with a temporary password. Choose your own to continue.
        </p>
      ) : null}
      <p className="exq-adm-password__rules">
        At least 12 characters. A short phrase of a few words works well. Changing it signs you out
        on every other device.
      </p>
      <form className="exq-adm-password__form" onSubmit={(e) => void submit(e)}>
        <p className="exq-adm-password__field">
          <label htmlFor="exq-adm-password-current">
            {forced ? 'Temporary password' : 'Current password'}
          </label>
          <input
            id="exq-adm-password-current"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => {
              setCurrent(e.target.value);
            }}
          />
        </p>
        <p className="exq-adm-password__field">
          <label htmlFor="exq-adm-password-new">New password</label>
          <input
            id="exq-adm-password-new"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={newPassword}
            onChange={(e) => {
              setNext(e.target.value);
            }}
          />
        </p>
        <p className="exq-adm-password__field">
          <label htmlFor="exq-adm-password-confirm">New password again</label>
          <input
            id="exq-adm-password-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            aria-invalid={mismatch}
            onChange={(e) => {
              setConfirm(e.target.value);
            }}
          />
        </p>
        {mismatch ? (
          <p className="exq-adm-password__mismatch" role="alert">
            The two new passwords do not match.
          </p>
        ) : null}
        <ErrorNote error={error} />
        {done ? (
          <p className="exq-adm-password__done" role="status">
            Password changed.
          </p>
        ) : null}
        <button type="submit" className="exq-adm-password__submit" disabled={working || mismatch}>
          Save new password
        </button>
      </form>
    </section>
  );
}
