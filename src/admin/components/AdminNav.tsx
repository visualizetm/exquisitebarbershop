import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import Calendar from '@untitled-ui/icons-react/build/esm/Calendar';
import DotsHorizontal from '@untitled-ui/icons-react/build/esm/DotsHorizontal';
import { okResponseSchema } from '@shared/api/auth';
import { Button, Mark } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { useMe, useSession } from '../useSession';

const BARBER_LINKS = [
  { to: '/admin/me', label: 'My schedule' },
  { to: '/admin/account', label: 'Account' },
];

/** The barber's navigation until the barber portal replaces it: My schedule and Account. */
export function AdminNav() {
  const me = useMe();
  const { signedOut } = useSession();
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);

  async function logout() {
    setWorking(true);
    try {
      await apiRequest('/api/auth/logout', okResponseSchema, { method: 'POST', body: {} });
    } finally {
      setWorking(false);
      signedOut();
      void navigate('/admin/login', { replace: true });
    }
  }

  const signOut = (
    <Button variant="outline" size="sm" loading={working} onClick={() => void logout()}>
      Sign out
    </Button>
  );
  return (
    <header className="exq-adm-nav" data-state="barber">
      <nav className="exq-adm-nav__side" aria-label="Staff">
        <Mark
          name="stacked"
          className="exq-adm-nav__logo"
          alt="Exquisite"
          width={200}
          height={47}
        />
        <p className="exq-adm-nav__who">
          <span className="exq-adm-nav__email">{me.user.email}</span>
          {me.staff ? <span className="exq-adm-nav__chair">{me.staff.name}</span> : null}
        </p>
        <ul className="exq-adm-nav__list">
          {BARBER_LINKS.map((item) => (
            <li key={item.to} className="exq-adm-nav__item">
              <NavLink to={item.to} className="exq-adm-nav__link">
                {({ isActive }) => (
                  <span data-state={isActive ? 'active' : 'idle'}>{item.label}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="exq-adm-nav__signout">{signOut}</div>
      </nav>
      <nav className="exq-adm-tabs" aria-label="Staff, mobile">
        {BARBER_LINKS.map((item) => (
          <NavLink key={item.to} to={item.to} className="exq-adm-tabs__tab">
            {({ isActive }) => (
              <span data-state={isActive ? 'active' : 'idle'}>
                {item.to.endsWith('/me') ? (
                  <Calendar aria-hidden="true" />
                ) : (
                  <DotsHorizontal aria-hidden="true" />
                )}
                {item.label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
