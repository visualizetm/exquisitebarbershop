import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

interface ChipBase {
  selected?: boolean | undefined;
  /** A small number after the label, for example how many services are in a group. */
  count?: number | undefined;
  /** A second, smaller line or suffix. */
  sub?: ReactNode | undefined;
  /** Selected chips are ink by default; "accent" makes them red for live choices. */
  tone?: 'ink' | 'accent' | undefined;
}

function chipAttrs({ selected, tone, disabled }: ChipBase & { disabled?: boolean | undefined }) {
  return {
    className: 'exq-chip',
    'data-state': disabled ? 'disabled' : selected ? 'selected' : 'default',
    'data-tone': tone ?? 'ink',
  };
}

function ChipBody({ children, count, sub }: ChipBase & { children: ReactNode }) {
  return (
    <>
      <span>{children}</span>
      {count !== undefined ? <span className="exq-chip__count">{count}</span> : null}
      {sub ? <span className="exq-chip__sub">{sub}</span> : null}
    </>
  );
}

/** A toggle or filter. States: default, selected, disabled. Optional count. */
export function Chip({
  selected = false,
  count,
  sub,
  tone,
  children,
  disabled,
  ...rest
}: ChipBase & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      {...chipAttrs({ selected, tone, disabled })}
      aria-pressed={selected}
      disabled={disabled}
    >
      <ChipBody count={count} sub={sub}>
        {children}
      </ChipBody>
    </button>
  );
}

/** The same chip as a link, for filters that live in the URL. */
export function ChipLink({
  selected = false,
  count,
  sub,
  tone,
  to,
  children,
}: ChipBase & { to: string; children: ReactNode }) {
  return (
    <Link to={to} {...chipAttrs({ selected, tone })} aria-current={selected ? 'true' : undefined}>
      <ChipBody count={count} sub={sub}>
        {children}
      </ChipBody>
    </Link>
  );
}

/** A row of chips. Scrolls sideways when asked, otherwise wraps. */
export function Chips({
  scroll = false,
  children,
  label,
}: {
  scroll?: boolean;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="exq-chips"
      data-scroll={scroll ? 'true' : 'false'}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}
