import { useEffect } from 'react';
import { setBar, type BarConfig } from './barStore';

/**
 * Lets a page change what the phone bottom bar says: BOOK MARCUS on a profile, BACK and CONTINUE in
 * booking. The bar goes back to CALL and BOOK NOW when the page unmounts.
 */
export function useBar(config: BarConfig): void {
  useEffect(() => {
    setBar(config);
  });
  useEffect(
    () => () => {
      setBar(null);
    },
    [],
  );
}
