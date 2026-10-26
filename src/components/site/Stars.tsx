import type { CSSProperties } from 'react';
import Star01 from '@untitled-ui/icons-react/build/esm/Star01';

const FIVE = [0, 1, 2, 3, 4];

/**
 * Five stars filled to `value` out of 5 (4.7 fills four and most of the fifth). Drawn with the
 * icon set: outlines underneath, filled stars on top, clipped to the value. Decorative only; the
 * caller always puts the rating in words next to them for screen readers.
 * States: full (5), partial (anything less).
 */
export function Stars({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const clamped = Math.max(0, Math.min(5, value));
  const style = { '--fill': `${String((clamped / 5) * 100)}%` } as CSSProperties;
  return (
    <span
      className="exq-stars"
      data-size={size}
      data-state={clamped >= 5 ? 'full' : 'partial'}
      style={style}
      aria-hidden="true"
    >
      <span className="exq-stars__row">
        {FIVE.map((i) => (
          <Star01 key={i} />
        ))}
      </span>
      <span className="exq-stars__row exq-stars__row--fill">
        {FIVE.map((i) => (
          <Star01 key={i} />
        ))}
      </span>
    </span>
  );
}
