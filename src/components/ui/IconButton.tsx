import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * A button that is only an icon. The label is required: it becomes the accessible name and the
 * tooltip shown on hover and focus on desktop. `tip` is a shorter tooltip for a label that names
 * its item ("Move Low fade with a hard part up"), where the row already shows which item it is and
 * the full label would run off the screen.
 */
export function IconButton({
  label,
  tip,
  icon,
  className,
  type = 'button',
  ...rest
}: { label: string; tip?: string; icon: ReactNode } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
>) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      data-tip={tip ?? label}
      className={`exq-iconbtn ${className ?? ''}`.trim()}
    >
      {icon}
    </button>
  );
}
