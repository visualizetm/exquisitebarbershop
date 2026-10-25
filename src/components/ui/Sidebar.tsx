import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

export interface SidebarItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  /** A small number after the label, for example new bookings. */
  badge?: number | undefined;
}

/**
 * The owner dashboard's fixed left rail from 1024px: logo on top, one row per area (icon and
 * label), and a footer slot for who is signed in, the theme switch and sign out. Ink in both
 * themes; the current row has a white label, a 3px red bar and a lighter ink row.
 */
export function Sidebar({
  label,
  logo,
  items,
  footer,
}: {
  label: string;
  logo: ReactNode;
  items: SidebarItem[];
  footer: ReactNode;
}) {
  return (
    <aside className="exq-sidebar exq-dark" data-state="ready">
      <div className="exq-sidebar__logo">{logo}</div>
      <nav aria-label={label}>
        <ul className="exq-sidebar__list exq-bare">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end ?? false} className="exq-sidebar__link">
                {({ isActive }) => (
                  <span className="exq-sidebar__row" data-state={isActive ? 'active' : 'idle'}>
                    {item.icon}
                    <span className="exq-sidebar__label">{item.label}</span>
                    {item.badge ? <span className="exq-sidebar__badge">{item.badge}</span> : null}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="exq-sidebar__footer">{footer}</div>
    </aside>
  );
}
