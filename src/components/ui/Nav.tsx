import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import Menu01 from '@untitled-ui/icons-react/build/esm/Menu01';
import { ButtonLink } from './Button';
import { Sheet } from './Sheet';

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/services', label: 'Services', end: false },
  { to: '/chairs', label: 'The Chairs', end: false },
  { to: '/gallery', label: 'Gallery', end: false },
  { to: '/visit', label: 'Visit', end: false },
] as const;

/**
 * The public site header. Sticky, solid paper so it reads over any photo, with
 * the links inline from 1024px and in a Sheet below that. Keeps the
 * exq-site-header and exq-primary-nav classes from the first build.
 */
export function Nav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Navigating closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <header className="exq-site-header exq-nav" data-state={open ? 'open' : 'closed'}>
      <div className="exq-wrap exq-nav__inner exq-site-header__inner">
        <NavLink
          to="/"
          className="exq-nav__brand exq-site-header__brand"
          aria-label="Exquisite Barber & Beauty Lounge, home"
        >
          <img
            className="exq-nav__logo"
            src="/brand/exq-primary-black.svg"
            alt=""
            width="200"
            height="32"
          />
        </NavLink>
        <nav id="exq-primary-nav" className="exq-nav__links exq-primary-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="exq-nav__link exq-primary-nav__link"
            >
              {({ isActive }) => (
                <span data-state={isActive ? 'active' : 'idle'}>{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="exq-nav__actions">
          <ButtonLink to="/book" size="sm">
            Book a chair
          </ButtonLink>
          <button
            type="button"
            className="exq-nav__toggle exq-site-header__toggle"
            aria-expanded={open}
            aria-controls="exq-mobile-nav"
            onClick={() => {
              setOpen(true);
            }}
          >
            <Menu01 aria-hidden="true" />
            <span className="exq-visually-hidden">Open menu</span>
          </button>
        </div>
      </div>
      <Sheet
        open={open}
        title="Menu"
        onClose={() => {
          setOpen(false);
        }}
      >
        <nav id="exq-mobile-nav" className="exq-nav__menu" aria-label="Primary, mobile">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="exq-nav__menu-link">
              {({ isActive }) => (
                <span data-state={isActive ? 'active' : 'idle'}>{item.label}</span>
              )}
            </NavLink>
          ))}
          <ButtonLink to="/book" block>
            Book a chair
          </ButtonLink>
        </nav>
      </Sheet>
    </header>
  );
}
