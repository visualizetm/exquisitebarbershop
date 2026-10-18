import { Outlet, useLocation } from 'react-router';
import { publicShopSchema } from '@shared/api/public';
import { SiteDown } from '@/components/site/SiteDown';
import { Footer, Nav, ToastProvider } from '@/components/ui';
import { shopJsonLd } from '@/lib/seo';
import { errorCodeOf } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useJsonLd } from '@/lib/useJsonLd';
import { useRouteFocus } from '@/lib/useRouteFocus';
import { ShopContext } from './shopContext';

export function PublicLayout() {
  const { pathname } = useLocation();
  // The setup page runs before the shop exists, so it never asks for it.
  const shop = useApi(pathname === '/setup' ? null : '/api/shop', publicShopSchema);
  useRouteFocus();
  useJsonLd(shop.status === 'ready' ? shopJsonLd(shop.data, window.location.origin) : null);
  // The API is down, or the owner switched maintenance on: one message instead of the pages.
  const down =
    shop.status === 'error'
      ? ('down' as const)
      : shop.status === 'ready' && shop.data.maintenance
        ? ('maintenance' as const)
        : null;
  const phone = shop.status === 'ready' ? shop.data.phone : __SHOP_PHONE__;
  return (
    <ShopContext.Provider value={shop}>
      <ToastProvider>
        <div className="exq-app" data-state="public">
          <a className="exq-skip-link" href="#exq-main">
            Skip to content
          </a>
          <Nav />
          <main id="exq-main" className="exq-main" tabIndex={-1}>
            {down ? (
              <SiteDown
                reason={down}
                phone={phone}
                code={shop.status === 'error' ? errorCodeOf(shop.error) : undefined}
              />
            ) : (
              <Outlet />
            )}
          </main>
          <Footer shop={shop.status === 'ready' ? shop.data : null} />
        </div>
      </ToastProvider>
    </ShopContext.Provider>
  );
}

export function AdminLayout() {
  useRouteFocus();
  return (
    <ToastProvider>
      <div className="exq-app" data-state="admin">
        <main id="exq-main" className="exq-main exq-main--admin" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
