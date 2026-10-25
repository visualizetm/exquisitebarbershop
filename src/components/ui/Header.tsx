import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { ButtonLink } from './Button';
import { Link, NavLink } from './Link';
import { Mark } from './Mark';
import { MobileMenu } from './MobileMenu';
import { NAV_ITEMS } from './navItems';
import { ThemeMenu } from './Theme';

const DESKTOP = '(min-width: 1024px)';

/**
 * The public header: white (ink while the menu is open), the logo on the left, the links inline
 * from 1024px or a hamburger below it, and a 2px ink rule underneath. The hamburger turns into an
 * X. Keeps the exq-site-header and exq-primary-nav classes from the first build.
 */
export function Header({ phone }: { phone: string }) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const location = useLocation();
  const barRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);
  // Navigating closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  // So does growing into the desktop layout.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const onChange = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  const toggle = () => {
    if (!open) setTop(barRef.current?.getBoundingClientRect().bottom ?? 0);
    setOpen((o) => !o);
  };

  return (
    <header
      ref={barRef}
      className={`exq-site-header exq-nav${open ? ' exq-dark' : ''}`}
      data-state={open ? 'open' : 'closed'}
    >
      <div className="exq-wrap exq-nav__inner exq-site-header__inner">
        <Link
          to="/"
          className="exq-nav__brand exq-site-header__brand"
          aria-label="Exquisite Barber & Beauty Lounge, home"
        >
          {/* The wordmark from 1024px; the stacked mark below, where the full name would not be readable. */}
          <span className="exq-nav__logo-wide">
            <Mark name="wordmark" className="exq-nav__logo" width={157} height={40} />
          </span>
          <span className="exq-nav__logo-narrow">
            <Mark name="stacked" className="exq-nav__logo" width={170} height={40} />
          </span>
        </Link>
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
          <ThemeMenu />
          <ButtonLink to="/book" size="sm" className="exq-nav__book">
            Book a chair
          </ButtonLink>
          <button
            ref={toggleRef}
            type="button"
            className="exq-nav__toggle exq-site-header__toggle"
            aria-expanded={open}
            aria-controls="exq-mobile-nav"
            onClick={toggle}
          >
            <span className="exq-burger" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="exq-visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </div>
      <MobileMenu open={open} phone={phone} top={top} onClose={close} />
    </header>
  );
}
