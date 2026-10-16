import { Outlet } from 'react-router';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export function PublicLayout() {
  return (
    <div className="exq-app" data-state="public">
      <a className="exq-skip-link" href="#exq-main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="exq-main" className="exq-main" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

export function AdminLayout() {
  return (
    <div className="exq-app" data-state="admin">
      <main id="exq-main" className="exq-main exq-main--admin" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
