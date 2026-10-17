import { createContext } from 'react';
import type { PublicShop } from '@shared/api/public';
import type { ApiState } from '@/lib/useApi';

/** The one /api/shop fetch per page load, shared by the layout, the pages and the SEO hooks. */
export const ShopContext = createContext<ApiState<PublicShop> | null>(null);
