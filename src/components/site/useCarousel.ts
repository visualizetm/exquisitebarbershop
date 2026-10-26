import { useCallback, useEffect, useRef, useState } from 'react';
import { createAutoplay } from './carouselAutoplay';

const INTERVAL_MS = 4000;
const NARROW = '(max-width: 1023px)';
const REDUCE = '(prefers-reduced-motion: reduce)';

function cardAt(list: HTMLElement, i: number): HTMLElement | null {
  return (list.children[i] as HTMLElement | undefined) ?? null;
}

/** The scrollLeft at which card i sits at the strip's snap start. */
function leftOf(list: HTMLElement, i: number): number {
  const first = cardAt(list, 0);
  const card = cardAt(list, i);
  return first && card ? card.offsetLeft - first.offsetLeft : 0;
}

/**
 * Today's chairs as a carousel under 1024px: native scroll snap does the moving; this hook follows
 * the current card, auto-advances every 4 seconds (wrapping) and offers goTo for the dots. Scrolling
 * is read through a passive listener and one frame at a time. From 1024px the list is a grid and
 * the autoplay is off. `ready` is when the real list (not the skeleton) is mounted.
 */
export function useCarousel(
  count: number,
  ready: boolean,
): {
  ref: React.RefObject<HTMLUListElement | null>;
  index: number;
  goTo: (i: number) => void;
} {
  const ref = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const stopRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const list = ref.current;
    if (!ready || !list || count < 2 || typeof matchMedia === 'undefined') return;
    const narrow = matchMedia(NARROW);
    const reduce = matchMedia(REDUCE);
    const play = createAutoplay({
      interval: INTERVAL_MS,
      onAdvance: () => {
        const next = (indexRef.current + 1) % count;
        list.scrollTo({ left: leftOf(list, next), behavior: 'smooth' });
      },
    });
    stopRef.current = () => {
      play.stop();
    };
    const enable = () => {
      play.setEnabled(narrow.matches && !reduce.matches);
    };
    narrow.addEventListener('change', enable);
    reduce.addEventListener('change', enable);

    // Which card is in view: read once per frame.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const stride = leftOf(list, 1) || list.clientWidth;
        const i = Math.max(0, Math.min(count - 1, Math.round(list.scrollLeft / stride)));
        if (i !== indexRef.current) {
          indexRef.current = i;
          setIndex(i);
        }
      });
    };
    list.addEventListener('scroll', onScroll, { passive: true });

    // A finger down pauses. The browser taking the gesture for scrolling (pointercancel), or the
    // strip having moved by the time the finger lifts, counts as a swipe and stops it for good.
    let startLeft = 0;
    const onDown = (e: PointerEvent) => {
      startLeft = list.scrollLeft;
      play.hold('pointer');
      if (e.pointerType === 'mouse') play.hold('hover');
    };
    const onUp = () => {
      if (Math.abs(list.scrollLeft - startLeft) > 8) play.stop();
      play.release('pointer');
    };
    const onCancel = () => {
      play.stop();
      play.release('pointer');
    };
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') play.hold('hover');
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') play.release('hover');
    };
    const region = list.parentElement ?? list;
    const onFocusIn = () => {
      play.hold('focus');
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!region.contains(e.relatedTarget as Node | null)) play.release('focus');
    };
    const onVisibility = () => {
      if (document.hidden) play.hold('hidden');
      else play.release('hidden');
    };
    list.addEventListener('pointerdown', onDown, { passive: true });
    list.addEventListener('pointerup', onUp, { passive: true });
    list.addEventListener('pointercancel', onCancel, { passive: true });
    list.addEventListener('pointerenter', onEnter, { passive: true });
    list.addEventListener('pointerleave', onLeave, { passive: true });
    region.addEventListener('focusin', onFocusIn);
    region.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    // Off screen: nothing moves where nobody can see it. Without the observer (very old browsers)
    // the strip simply runs while the tab is visible.
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      play.hold('offscreen');
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) play.release('offscreen');
            else play.hold('offscreen');
          }
        },
        { threshold: 0.5 },
      );
      io.observe(list);
    }
    enable();

    return () => {
      play.dispose();
      io?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      narrow.removeEventListener('change', enable);
      reduce.removeEventListener('change', enable);
      list.removeEventListener('scroll', onScroll);
      list.removeEventListener('pointerdown', onDown);
      list.removeEventListener('pointerup', onUp);
      list.removeEventListener('pointercancel', onCancel);
      list.removeEventListener('pointerenter', onEnter);
      list.removeEventListener('pointerleave', onLeave);
      region.removeEventListener('focusin', onFocusIn);
      region.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [count, ready]);

  const goTo = useCallback((i: number) => {
    const list = ref.current;
    if (!list) return;
    stopRef.current();
    list.scrollTo({ left: leftOf(list, i), behavior: 'smooth' });
  }, []);

  return { ref, index, goTo };
}
