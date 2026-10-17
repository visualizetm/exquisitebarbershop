import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

/** emphasis: the strongest button for the surface it sits on (red on paper, paper on ink, red in dark). */
export type ButtonVariant = 'primary' | 'secondary' | 'inverse' | 'emphasis';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Common {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches to the full width of its container. */
  block?: boolean;
  icon?: ReactNode;
}

export interface ButtonProps extends Common, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  pressed?: boolean;
}

/** The one button. States: default, hover, pressed, disabled and loading, all on data-state. */
export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  loading = false,
  pressed = false,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const state = loading ? 'loading' : disabled ? 'disabled' : pressed ? 'pressed' : 'default';
  return (
    <button
      {...rest}
      type={type}
      className={`exq-btn ${rest.className ?? ''}`.trim()}
      data-variant={variant}
      data-size={size}
      data-block={block ? 'true' : 'false'}
      data-state={state}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      aria-pressed={pressed || undefined}
    >
      {loading ? <span className="exq-btn__spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export interface ButtonLinkProps extends Common, LinkProps {}

/** A link that looks like a button. Routing stays with React Router. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      {...rest}
      className={`exq-btn ${rest.className ?? ''}`.trim()}
      data-variant={variant}
      data-size={size}
      data-block={block ? 'true' : 'false'}
      data-state="default"
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

/** A plain anchor that looks like a button, for tel:, mailto: and external links. */
export function ButtonAnchor({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  children,
  ...rest
}: Common & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...rest}
      className={`exq-btn ${rest.className ?? ''}`.trim()}
      data-variant={variant}
      data-size={size}
      data-block={block ? 'true' : 'false'}
      data-state="default"
    >
      {icon}
      <span>{children}</span>
    </a>
  );
}
