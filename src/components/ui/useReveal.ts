import { useLayoutEffect, useRef } from 'react';
import { motionReady } from '@/lib/motion';

let observer: IntersectionObserver | null = null;

function shared(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      const arriving = entries
        .filter((e) => e.isIntersecting)
        .sort(
          (a, b) =>
            a.boundingClientRect.top - b.boundingClientRect.top ||
            a.boundingClientRect.left - b.boundingClientRect.left,
        );
      arriving.forEach((entry, i) => {
        const el = entry.target as HTMLElement;
        el.style.setProperty('--reveal-i', String(Math.min(i, 5)));
        el.dataset.reveal = 'shown';
        observer?.unobserve(el);
      });
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.01 },
  );
  return observer;
}

/** Wires an element to the reveal. Used by Reveal and Lines. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !motionReady()) return;
    // Already on screen, or above it: leave it alone.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    // Hide without a transition: the element was already measured, so a plain change would fade it out.
    el.style.transition = 'none';
    el.dataset.reveal = 'hidden';
    // Reading the layout makes the browser apply the hidden state before the transition returns.
    el.getBoundingClientRect();
    el.style.transition = '';
    const io = shared();
    io.observe(el);
    return () => {
      io.unobserve(el);
    };
  }, []);
  return ref;
}
