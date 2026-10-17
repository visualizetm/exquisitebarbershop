import { useContext } from 'react';
import { ShopContext } from './shopContext';

/** Shop details loaded once by the public layout. Throws outside it, which is a wiring bug. */
export function useShop() {
  const shop = useContext(ShopContext);
  if (!shop) throw new Error('useShop needs the public layout');
  return shop;
}
