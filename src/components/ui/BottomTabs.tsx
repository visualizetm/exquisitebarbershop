import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

export interface BottomTabItem {
  label: string;
  icon: ReactNode;
  /** A route. Omit for a button (for example "More"). */
  to?: string;
  end?: boolean;
  onClick?: () => void;
  /** For button tabs: whether the thing they open is open. */
  active?: boolean;
}

/**
 * The fixed tab bar on phones: four items, icon over label, 56px tall. Route tabs are links
 * and mark the current one with aria-current; button tabs report expanded state.
 */
export function BottomTabs({
  label,
  items,
  portal = false,
}: {
  label: string;
  items: BottomTabItem[];
  /** The barber portal keeps its tab bar on every screen size; the dashboard hides it from 1024px. */
  portal?: boolean;
}) {
  return (
    <nav className="exq-bottomtabs" aria-label={label} data-portal={portal ? 'true' : 'false'}>
      {items.map((item) =>
        item.to !== undefined ? (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end ?? false}
            className="exq-bottomtabs__tab"
          >
            {({ isActive }) => (
              <span data-state={isActive ? 'active' : 'idle'}>
                {item.icon}
                {item.label}
              </span>
            )}
          </NavLink>
        ) : (
          <button
            key={item.label}
            type="button"
            className="exq-bottomtabs__tab"
            aria-expanded={item.active ?? false}
            onClick={item.onClick}
          >
            <span data-state={item.active ? 'active' : 'idle'}>
              {item.icon}
              {item.label}
            </span>
          </button>
        ),
      )}
    </nav>
  );
}
