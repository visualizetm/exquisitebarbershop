import type { HTMLAttributes } from 'react';

/** A bordered surface. States: static, interactive (lifts on hover, desktop only). */
export function Card({
  pad = 'md',
  interactive = false,
  as: Tag = 'div',
  ...rest
}: HTMLAttributes<HTMLElement> & {
  pad?: 'none' | 'md' | 'lg';
  interactive?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <Tag
      {...rest}
      className={`exq-card ${rest.className ?? ''}`.trim()}
      data-pad={pad}
      data-state={interactive ? 'interactive' : 'static'}
    />
  );
}
