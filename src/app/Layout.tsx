import { Outlet, useLocation } from 'react-router';
import { publicShopSchema } from '@shared/api/public';
import { SiteDown } from '@/components/site/SiteDown';
import { BottomBar, Footer, Header, ToastProvider, TopStrip } from '@/components/ui';
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
  const tel = phone.replace(/[^\d+]/g, '');
  // The strip waits for the shop settings; setup and a down site have none to show.
  const stripLoading = shop.status === 'loading' && pathname !== '/setup';
  return (
    <ShopContext.Provider value={shop}>
      <ToastProvider>
        <div className="exq-app" data-state="public">
          <a className="exq-skip-link" href="#exq-main">
            Skip to content
          </a>
          <TopStrip
            announcement={shop.status === 'ready' ? shop.data.announcement : undefined}
            loading={stripLoading}
          />
          <Header phone={tel} />
          <main id="exq-main" className="exq-main" tabIndex={-1} data-menu-inert>
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
          <BottomBar phone={tel} />
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
