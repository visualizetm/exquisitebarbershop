import { useEffect } from 'react';
import Phone01 from '@untitled-ui/icons-react/build/esm/Phone01';
import { ButtonAnchor, ButtonLink } from './Button';
import { NavLink } from './Link';
import { NAV_ITEMS } from './navItems';
import { ThemeSwitch } from './Theme';

/**
 * The full-screen ink menu for phones and tablets. It slides down from under the header, the
 * links stagger in, and Call and Book wait at the bottom. While open the page behind is inert.
 */
export function MobileMenu({
  open,
  phone,
  top,
  onClose,
}: {
  open: boolean;
  phone: string;
  /** Where the header ends, so the menu starts right under it. */
  top: number;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const inert = document.querySelectorAll('[data-menu-inert]');
    inert.forEach((el) => {
      el.setAttribute('inert', '');
    });
    document.documentElement.setAttribute('data-menu', 'open');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      inert.forEach((el) => {
        el.removeAttribute('inert');
      });
      document.documentElement.removeAttribute('data-menu');
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div
      id="exq-mobile-nav"
      className="exq-menu exq-dark"
      data-state={open ? 'open' : 'closed'}
      style={{ paddingTop: top }}
    >
      <nav className="exq-menu__nav" aria-label="Primary, mobile">
        {NAV_ITEMS.map((item, i) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="exq-menu__link"
            style={{ '--i': i } as React.CSSProperties}
          >
            {({ isActive }) => <span data-state={isActive ? 'active' : 'idle'}>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="exq-menu__foot">
        <ThemeSwitch />
        <div className="exq-menu__actions">
          <ButtonAnchor
            href={`tel:${phone}`}
            variant="onink"
            block
            icon={<Phone01 aria-hidden="true" />}
          >
            Call
          </ButtonAnchor>
          <ButtonLink to="/book" variant="accent" block>
            Book a chair
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
