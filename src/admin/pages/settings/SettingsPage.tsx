import { NavLink, Navigate, Route, Routes } from 'react-router';
import { usePageTitle } from '@/lib/usePageTitle';
import { ClosuresSettings } from './ClosuresSettings';
import { HoursSettings } from './HoursSettings';
import { LoginsSettings } from './LoginsSettings';
import { ServicesSettings } from './ServicesSettings';
import { ShopSettings } from './ShopSettings';
import { StaffSettings } from './StaffSettings';

const SECTIONS = [
  { to: 'services', label: 'Services' },
  { to: 'staff', label: 'Staff' },
  { to: 'hours', label: 'Hours' },
  { to: 'closures', label: 'Closures' },
  { to: 'shop', label: 'Shop settings' },
  { to: 'logins', label: 'Logins' },
];

export function SettingsPage() {
  usePageTitle('Settings');
  return (
    <article className="exq-adm-settings">
      <h1 className="exq-adm-settings__title">Settings</h1>
      <nav className="exq-adm-settings__nav" aria-label="Settings sections">
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.to}>
              <NavLink to={`/admin/settings/${s.to}`} className="exq-adm-settings__link">
                {({ isActive }) => <span data-state={isActive ? 'active' : 'idle'}>{s.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Routes>
        <Route index element={<Navigate to="services" replace />} />
        <Route path="services" element={<ServicesSettings />} />
        <Route path="staff" element={<StaffSettings />} />
        <Route path="hours" element={<HoursSettings />} />
        <Route path="closures" element={<ClosuresSettings />} />
        <Route path="shop" element={<ShopSettings />} />
        <Route path="logins" element={<LoginsSettings />} />
        <Route path="*" element={<Navigate to="services" replace />} />
      </Routes>
    </article>
  );
}
