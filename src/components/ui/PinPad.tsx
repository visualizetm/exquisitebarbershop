import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Delete from '@untitled-ui/icons-react/build/esm/Delete';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * A numeric PIN pad: six dots and a 3 by 4 keypad with 64px keys. It submits by itself on the
 * last digit, takes the physical keyboard too, and clears itself when the caller bumps `resetKey`
 * (after a wrong PIN). The dots are decorative; a status line says how many digits are in.
 */
export function PinPad({
  length = 6,
  label,
  onComplete,
  disabled = false,
  error,
  resetKey = 0,
}: {
  length?: number;
  label: string;
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: string | null | undefined;
  /** Change this number to clear the digits. */
  resetKey?: number;
}) {
  const [digits, setDigits] = useState('');
  const done = useRef(false);

  useEffect(() => {
    setDigits('');
    done.current = false;
  }, [resetKey]);

  function press(digit: string) {
    if (disabled || done.current) return;
    const next = (digits + digit).slice(0, length);
    setDigits(next);
    if (next.length === length) {
      done.current = true;
      onComplete(next);
    }
  }
  function back() {
    if (disabled || done.current) return;
    setDigits((d) => d.slice(0, -1));
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      press(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      back();
    }
  }

  return (
    <div
      className="exq-pin"
      role="group"
      aria-label={label}
      data-state={disabled ? 'disabled' : error ? 'error' : 'ready'}
      onKeyDown={onKeyDown}
    >
      <div className="exq-pin__dots" aria-hidden="true">
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className="exq-pin__dot"
            data-state={i < digits.length ? 'filled' : 'empty'}
          />
        ))}
      </div>
      <p className="exq-pin__status" role="status">
        {error ?? `${digits.length} of ${length} digits`}
      </p>
      <div className="exq-pin__keys">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="exq-pin__key"
            disabled={disabled}
            onClick={() => {
              press(k);
            }}
          >
            {k}
          </button>
        ))}
        <span aria-hidden="true" />
        <button
          type="button"
          className="exq-pin__key"
          disabled={disabled}
          onClick={() => {
            press('0');
          }}
        >
          0
        </button>
        <button
          type="button"
          className="exq-pin__key exq-pin__key--back"
          aria-label="Delete last digit"
          disabled={disabled || digits.length === 0}
          onClick={back}
        >
          <Delete aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
