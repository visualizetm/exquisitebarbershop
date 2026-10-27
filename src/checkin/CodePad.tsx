import Delete from '@untitled-ui/icons-react/build/esm/Delete';
import { useState } from 'react';

/**
 * A six digit pad with 64px keys for the tablet: the pairing code and the exit PIN. It calls
 * `onComplete` on the sixth digit and clears itself; the digits show as dots.
 */
export function CodePad({
  label,
  onComplete,
  disabled = false,
  error,
}: {
  label: string;
  onComplete: (code: string) => void;
  disabled?: boolean;
  error?: string | null | undefined;
}) {
  const [digits, setDigits] = useState('');
  const press = (d: string) => {
    if (disabled) return;
    const next = digits + d;
    if (next.length < 6) {
      setDigits(next);
      return;
    }
    setDigits('');
    onComplete(next);
  };
  return (
    <div className="exq-codepad" role="group" aria-label={label}>
      <p className="exq-codepad__dots" aria-live="polite">
        <span className="exq-visually-hidden">{`${String(digits.length)} of 6 digits`}</span>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className="exq-codepad__dot"
            data-state={i < digits.length ? 'on' : 'off'}
          />
        ))}
      </p>
      {error ? (
        <p className="exq-codepad__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="exq-codepad__keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            className="exq-codepad__key"
            disabled={disabled}
            onClick={() => {
              press(d);
            }}
          >
            {d}
          </button>
        ))}
        <span aria-hidden="true" />
        <button
          type="button"
          className="exq-codepad__key"
          disabled={disabled}
          onClick={() => {
            press('0');
          }}
        >
          0
        </button>
        <button
          type="button"
          className="exq-codepad__key"
          aria-label="Delete the last digit"
          disabled={disabled || digits.length === 0}
          onClick={() => {
            setDigits((d) => d.slice(0, -1));
          }}
        >
          <Delete aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
