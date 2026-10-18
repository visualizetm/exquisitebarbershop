import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import type { LinkProps } from 'react-router';
import { Link } from './Link';

/**
 * primary: ink (paper in dark). accent: red. outline: ink border. ghost: no border.
 * onink: white, for ink bands.
 */
export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'onink';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Common {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  /** Stretches to the full width of its container. */
  block?: boolean | undefined;
  icon?: ReactNode;
}

function attrs(
  { variant = 'primary', size = 'md', block = false }: Common,
  state: string,
  className: string | undefined,
) {
  return {
    className: `exq-btn ${className ?? ''}`.trim(),
    'data-variant': variant,
    'data-size': size,
    'data-block': block ? 'true' : 'false',
    'data-state': state,
  };
}

function Body({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <>
      {icon}
      <span className="exq-btn__label">{children}</span>
    </>
  );
}

export interface ButtonProps extends Common, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  pressed?: boolean;
}

/**
 * The one button. States: default, hover (CSS), pressed, disabled and loading, all on
 * data-state. Loading keeps the label in place (hidden) so the width never changes.
 */
export function Button({
  variant,
  size,
  block,
  icon,
  loading = false,
  pressed = false,
  disabled,
  children,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const state = loading ? 'loading' : disabled ? 'disabled' : pressed ? 'pressed' : 'default';
  return (
    <button
      {...rest}
      {...attrs({ variant, size, block }, state, className)}
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      aria-pressed={pressed || undefined}
    >
      <Body icon={icon}>{children}</Body>
      {loading ? <span className="exq-btn__spinner" aria-hidden="true" /> : null}
    </button>
  );
}

export interface ButtonLinkProps extends Common, LinkProps {}

/** A link that looks like a button. Routing stays with React Router. */
export function ButtonLink({
  variant,
  size,
  block,
  icon,
  children,
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link {...rest} {...attrs({ variant, size, block }, 'default', className)}>
      <Body icon={icon}>{children}</Body>
    </Link>
  );
}

/** A plain anchor that looks like a button, for tel:, mailto: and external links. */
export function ButtonAnchor({
  variant,
  size,
  block,
  icon,
  children,
  className,
  ...rest
}: Common & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} {...attrs({ variant, size, block }, 'default', className)}>
      <Body icon={icon}>{children}</Body>
    </a>
  );
}
