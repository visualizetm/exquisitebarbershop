/**
 * Motion is progressive. Content is visible by default; `motion-ready` on <html> is what lets
 * anything start hidden or animate in. It is added only when IntersectionObserver exists and the
 * visitor allows motion, and removed again if they switch reduced motion on while the page is open.
 */
const READY = 'motion-ready';
const REDUCE = '(prefers-reduced-motion: reduce)';

export function motionReady(): boolean {
  return document.documentElement.classList.contains(READY);
}

export function initMotion(): void {
  const root = document.documentElement;
  if (typeof IntersectionObserver === 'undefined' || typeof matchMedia === 'undefined') return;
  const query = matchMedia(REDUCE);
  const apply = () => {
    root.classList.toggle(READY, !query.matches);
  };
  apply();
  query.addEventListener('change', apply);
}
