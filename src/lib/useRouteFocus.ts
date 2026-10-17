import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * After a route change, moves focus to the page heading so screen readers and
 * keyboard users land on the new page instead of staying on the nav link they
 * pressed. The first load is left alone (nothing is focused, so no ring shows),
 * and a page that already placed focus inside main (the Book steps) keeps it.
 */
export function useRouteFocus(): void {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // A tick later, so page-level focus (a step heading) has had its turn.
    const id = window.setTimeout(() => {
      const main = document.getElementById('exq-main');
      const active = document.activeElement;
      if (main && active && active !== document.body && main.contains(active)) return;
      const h1 = main?.querySelector<HTMLElement>('h1') ?? null;
      if (!h1) return;
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }, 0);
    return () => {
      window.clearTimeout(id);
    };
  }, [pathname]);
}
