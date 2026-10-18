import type { ReactNode } from 'react';

export interface OptionCardProps {
  /** checkbox and radio render a native input inside a label; button renders a button. */
  kind?: 'checkbox' | 'radio' | 'button';
  selected: boolean;
  disabled?: boolean;
  title: ReactNode;
  description?: ReactNode;
  /** The right side: usually a duration and a price. */
  meta?: ReactNode;
  /** A leading visual such as a portrait. */
  lead?: ReactNode;
  name?: string;
  onChange?: () => void;
}

/**
 * A choice as a card: white with a light border, ink with a short red underline under the
 * title when selected. One component for services (checkbox), chairs (radio or button).
 */
export function OptionCard({
  kind = 'checkbox',
  selected,
  disabled = false,
  title,
  description,
  meta,
  lead,
  name,
  onChange,
}: OptionCardProps) {
  const state = disabled ? 'disabled' : selected ? 'selected' : 'default';
  const body = (
    <span className="exq-option__body">
      {lead ? <span className="exq-option__lead">{lead}</span> : null}
      <span className="exq-option__text">
        <span className="exq-option__title">{title}</span>
        {description ? <span className="exq-option__description">{description}</span> : null}
      </span>
      {meta ? <span className="exq-option__meta">{meta}</span> : null}
    </span>
  );
  if (kind === 'button') {
    return (
      <button
        type="button"
        className="exq-option"
        data-state={state}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onChange}
      >
        {body}
      </button>
    );
  }
  return (
    <label className="exq-option" data-state={state}>
      <input
        className="exq-option__input"
        type={kind}
        name={name}
        checked={selected}
        disabled={disabled}
        onChange={onChange}
      />
      {body}
    </label>
  );
}
