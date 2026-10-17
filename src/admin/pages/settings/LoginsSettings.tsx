import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  issuedPasswordResponseSchema,
  loginListResponseSchema,
  loginResponseSchema,
  staffListResponseSchema,
  type LoginView,
} from '@shared/api/admin';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { ErrorNote } from '../../components/ErrorNote';
import { shopDateTime } from '../../format';
import { useMe } from '../../useSession';

interface Issued {
  email: string;
  password: string;
}

/**
 * Barber logins. A new login or a reset gets a temporary password shown once
 * here; the barber must replace it at first sign in. Resetting or disabling a
 * login ends its sessions right away.
 */
export function LoginsSettings() {
  const me = useMe();
  const [version, setVersion] = useState(0);
  const logins = useApi('/api/admin/users', loginListResponseSchema, { version });
  const staff = useApi('/api/admin/staff', staffListResponseSchema, { version });
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [email, setEmail] = useState('');
  const [staffId, setStaffId] = useState('');
  const refresh = () => {
    setVersion((v) => v + 1);
  };

  async function act(work: () => Promise<void>) {
    setError(null);
    try {
      await work();
      refresh();
    } catch (err) {
      setError(err);
    }
  }

  async function create(event: SyntheticEvent) {
    event.preventDefault();
    await act(async () => {
      const result = await apiRequest('/api/admin/users', issuedPasswordResponseSchema, {
        method: 'POST',
        body: { email, staffId },
      });
      setIssued({ email: result.user.email, password: result.temporaryPassword });
      setEmail('');
      setStaffId('');
    });
  }

  if (logins.status !== 'ready' || staff.status !== 'ready') {
    const failed = logins.status === 'error' || staff.status === 'error';
    return (
      <section className="exq-adm-logins" data-state={failed ? 'error' : 'loading'}>
        <h2>Logins</h2>
        <Status state={failed ? 'error' : 'loading'} />
      </section>
    );
  }
  const linked = new Set(logins.data.users.map((u) => u.staffId));
  const available = staff.data.staff.filter((s) => !s.deletedAt && !linked.has(s.id));

  return (
    <section className="exq-adm-logins" data-state="ready" aria-labelledby="exq-adm-logins-title">
      <h2 id="exq-adm-logins-title">Logins</h2>
      {issued ? (
        <div className="exq-adm-logins__issued" role="status" data-state="issued">
          <p>
            Temporary password for {issued.email}: <code>{issued.password}</code>
          </p>
          <p>
            Give it to them in person. It is shown only once, and they must choose their own
            password when they first sign in.
          </p>
          <button
            type="button"
            onClick={() => {
              setIssued(null);
            }}
          >
            Done, hide it
          </button>
        </div>
      ) : null}
      <ErrorNote error={error} />
      <ul className="exq-adm-logins__list">
        {logins.data.users.map((u) => (
          <LoginRow
            key={u._id}
            login={u}
            isSelf={u._id === me.user._id}
            onReset={() =>
              act(async () => {
                const result = await apiRequest(
                  `/api/admin/users/${u._id}/reset-password`,
                  issuedPasswordResponseSchema,
                  { method: 'POST', body: {} },
                );
                setIssued({ email: result.user.email, password: result.temporaryPassword });
              })
            }
            onToggle={() =>
              act(async () => {
                await apiRequest(
                  `/api/admin/users/${u._id}/${u.isActive ? 'disable' : 'enable'}`,
                  loginResponseSchema,
                  { method: 'POST', body: {} },
                );
              })
            }
          />
        ))}
      </ul>
      <form className="exq-adm-logins__create" onSubmit={(e) => void create(e)}>
        <h3>Give a barber a login</h3>
        {available.length === 0 ? (
          <p>Everyone on staff already has a login.</p>
        ) : (
          <>
            <p>
              <label htmlFor="exq-adm-login-staff">Staff member</label>{' '}
              <select
                id="exq-adm-login-staff"
                required
                value={staffId}
                onChange={(e) => {
                  setStaffId(e.target.value);
                }}
              >
                <option value="">Choose</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </p>
            <p>
              <label htmlFor="exq-adm-login-email">Their email</label>{' '}
              <input
                id="exq-adm-login-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
            </p>
            <button type="submit">Create login</button>
          </>
        )}
      </form>
    </section>
  );
}

function LoginRow({
  login,
  isSelf,
  onReset,
  onToggle,
}: {
  login: LoginView;
  isSelf: boolean;
  onReset: () => Promise<void>;
  onToggle: () => Promise<void>;
}) {
  return (
    <li
      className="exq-adm-logins__item"
      data-state={login.isActive ? 'active' : 'disabled'}
      data-role={login.role}
    >
      <span className="exq-adm-logins__email">{login.email}</span>{' '}
      <span className="exq-adm-logins__staff">
        {login.role === 'owner' ? 'Owner' : (login.staffName ?? 'No chair')}
      </span>
      {login.mustChangePassword ? (
        <span className="exq-adm-logins__temp"> (temporary password not changed yet)</span>
      ) : null}
      {!login.isActive ? <span className="exq-adm-logins__off"> (disabled)</span> : null}
      <span className="exq-adm-logins__last">
        {' '}
        Last sign in: {login.lastLoginAt ? shopDateTime(login.lastLoginAt) : 'never'}
      </span>
      {isSelf || login.role === 'owner' ? null : (
        <>
          {' '}
          <button type="button" className="exq-adm-logins__reset" onClick={() => void onReset()}>
            Reset password
          </button>{' '}
          <button type="button" className="exq-adm-logins__toggle" onClick={() => void onToggle()}>
            {login.isActive ? 'Disable login' : 'Enable login'}
          </button>
        </>
      )}
    </li>
  );
}
