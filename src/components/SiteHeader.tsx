import { useState } from 'react';
import { NavLink } from 'react-router';
import Menu01 from '@untitled-ui/icons-react/build/esm/Menu01';
import XClose from '@untitled-ui/icons-react/build/esm/XClose';

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/services', label: 'Services', end: false },
  { to: '/chairs', label: 'The Chairs', end: false },
  { to: '/gallery', label: 'Gallery', end: false },
  { to: '/visit', label: 'Visit', end: false },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };
  const toggle = () => {
    setOpen((v) => !v);
  };
  return (
    <header className="exq-site-header" data-state={open ? 'open' : 'closed'}>
      <div className="exq-site-header__inner">
        <NavLink to="/" className="exq-site-header__brand" onClick={close}>
          <span className="exq-site-header__name">Exquisite Barber & Beauty Lounge</span>
          <span className="exq-site-header__tagline">Gifted Hands</span>
        </NavLink>
        <button
          type="button"
          className="exq-site-header__toggle"
          aria-expanded={open}
          aria-controls="exq-primary-nav"
          onClick={toggle}
        >
          {open ? <XClose aria-hidden="true" /> : <Menu01 aria-hidden="true" />}
          <span className="exq-visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
        <nav
          id="exq-primary-nav"
          className="exq-primary-nav"
          aria-label="Primary"
          data-state={open ? 'open' : 'closed'}
        >
          <ul className="exq-primary-nav__list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="exq-primary-nav__item">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className="exq-primary-nav__link"
                  onClick={close}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li className="exq-primary-nav__item exq-primary-nav__item--cta">
              <NavLink
                to="/book"
                className="exq-primary-nav__link exq-primary-nav__link--cta"
                onClick={close}
              >
                Book now
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
