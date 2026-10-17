import { Outlet } from 'react-router';
import { publicShopSchema } from '@shared/api/public';
import { Footer, Nav, ToastProvider } from '@/components/ui';
import { shopJsonLd } from '@/lib/seo';
import { useApi } from '@/lib/useApi';
import { useJsonLd } from '@/lib/useJsonLd';
import { ShopContext } from './shopContext';

export function PublicLayout() {
  const shop = useApi('/api/shop', publicShopSchema);
  useJsonLd(shop.status === 'ready' ? shopJsonLd(shop.data, window.location.origin) : null);
  return (
    <ShopContext.Provider value={shop}>
      <ToastProvider>
        <div className="exq-app" data-state="public">
          <a className="exq-skip-link" href="#exq-main">
            Skip to content
          </a>
          <Nav />
          <main id="exq-main" className="exq-main" tabIndex={-1}>
            <Outlet />
          </main>
          <Footer shop={shop.status === 'ready' ? shop.data : null} />
        </div>
      </ToastProvider>
    </ShopContext.Provider>
  );
}

export function AdminLayout() {
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
