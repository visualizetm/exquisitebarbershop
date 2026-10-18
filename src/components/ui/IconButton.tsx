import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * A button that is only an icon. The label is required: it becomes the accessible name and the
 * tooltip shown on hover and focus on desktop.
 */
export function IconButton({
  label,
  icon,
  className,
  type = 'button',
  ...rest
}: { label: string; icon: ReactNode } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
>) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      data-tip={label}
      className={`exq-iconbtn ${className ?? ''}`.trim()}
    >
      {icon}
    </button>
  );
}
