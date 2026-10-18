import { useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

interface FieldFrame {
  label: ReactNode;
  hint?: ReactNode;
  /** Shown under the control in the danger color and announced. */
  error?: ReactNode;
  /** A softer note, for example "This number looks unusual". */
  warning?: ReactNode;
}

function frame(
  id: string,
  { label, hint, error, warning }: FieldFrame,
  control: (describedBy: string | undefined) => ReactNode,
) {
  const state = error ? 'error' : warning ? 'warning' : 'default';
  const messageId = `${id}-message`;
  const hintId = `${id}-hint`;
  const describedBy =
    [hint ? hintId : null, (error ?? warning) ? messageId : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="exq-field" data-state={state}>
      <label className="exq-field__label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <span id={hintId} className="exq-field__hint">
          {hint}
        </span>
      ) : null}
      {control(describedBy)}
      {(error ?? warning) ? (
        <span id={messageId} className="exq-field__message" role={error ? 'alert' : undefined}>
          {error ?? warning}
        </span>
      ) : null}
    </div>
  );
}

/** Text input. States: default, focus (CSS), error, warning, disabled. */
export function Input({
  label,
  hint,
  error,
  warning,
  id: givenId,
  ...rest
}: FieldFrame & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return frame(id, { label, hint, error, warning }, (describedBy) => (
    <input
      {...rest}
      id={id}
      className="exq-field__control"
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
    />
  ));
}

export function Select({
  label,
  hint,
  error,
  warning,
  id: givenId,
  children,
  ...rest
}: FieldFrame & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return frame(id, { label, hint, error, warning }, (describedBy) => (
    <select
      {...rest}
      id={id}
      className="exq-field__control"
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
    >
      {children}
    </select>
  ));
}

export function Textarea({
  label,
  hint,
  error,
  warning,
  id: givenId,
  ...rest
}: FieldFrame & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return frame(id, { label, hint, error, warning }, (describedBy) => (
    <textarea
      {...rest}
      id={id}
      className="exq-field__control"
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
    />
  ));
}

/** A checkbox with its label, 44px tall so a thumb can hit it. */
export function Checkbox({
  label,
  hint,
  className,
  ...rest
}: { label: ReactNode; hint?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <label
      className={`exq-check ${className ?? ''}`.trim()}
      data-state={rest.disabled ? 'disabled' : 'default'}
    >
      <input {...rest} type="checkbox" />
      <span>
        {label}
        {hint ? <span className="exq-check__hint">{hint}</span> : null}
      </span>
    </label>
  );
}

/** An on/off switch. The visible label says what it is now; it is a button with role switch. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  busy = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="exq-switch"
      data-state={checked ? 'on' : 'off'}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span className="exq-switch__track" aria-hidden="true">
        <span className="exq-switch__thumb" />
      </span>
      <span className="exq-switch__label">{label}</span>
    </button>
  );
}
