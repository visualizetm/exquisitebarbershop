import { createElement } from 'react';
import { useReveal } from './useReveal';

export interface Line {
  text: string;
  /** Set the line in the accent color (red on paper, brighter red on ink). */
  accent?: boolean;
}

/**
 * A heading set line by line. Each line is clipped and its text rises into place, 60ms apart.
 * mode "load" plays once when the page loads (the hero); "scroll" plays when it first scrolls
 * into view (the CTA band). The text is always at full opacity, only its position moves.
 */
export function Lines({
  as = 'h2',
  lines,
  mode,
  className,
  id,
}: {
  as?: 'h1' | 'h2';
  lines: Line[];
  mode: 'load' | 'scroll';
  className?: string;
  id?: string;
}) {
  const ref = useReveal<HTMLElement>();
  return createElement(
    as,
    { ref, id, className: `exq-lines ${className ?? ''}`.trim(), 'data-mode': mode },
    lines.map((line, i) => (
      <span className="exq-lines__line" key={line.text}>
        <span
          className="exq-lines__text"
          data-accent={line.accent ? 'true' : undefined}
          style={{ '--i': i } as React.CSSProperties}
        >
          {line.text}
          {i < lines.length - 1 ? ' ' : ''}
        </span>
      </span>
    )),
  );
}
