import { createElement } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useReveal } from './useReveal';

/**
 * Scroll reveals, once each. Everything is visible by default. When motion is ready, an element
 * that starts below the fold gets data-reveal="hidden", and one shared observer flips it to
 * "shown" the first time it scrolls into view. An element already in view at load is never
 * hidden. Elements revealed in the same pass get a 60ms stagger (capped).
 */
type Tag = 'div' | 'li' | 'section' | 'article' | 'p' | 'span' | 'figure' | 'dl';

export function Reveal({
  as = 'div',
  kind = 'rise',
  className,
  style,
  children,
  ...rest
}: {
  as?: Tag;
  /** rise: 16px up and in. wipe: a clip-path wipe from the bottom, for photos. */
  kind?: 'rise' | 'wipe';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const ref = useReveal<HTMLElement>();
  return createElement(as, { ref, className, style, 'data-reveal-kind': kind, ...rest }, children);
}
