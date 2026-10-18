import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Step title that takes focus when it appears, so screen readers and keyboard users land on it.
 * With a number it opens with the ink circle from the booking bar ("3 PICK A TIME").
 */
export function StepHeading({
  step,
  focusKey = '',
  number,
  children,
}: {
  step: string;
  /** Change it to pull focus back to the heading while staying on the same step. */
  focusKey?: string;
  number?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // A tick later, so a closing dialog's focus restore does not win over the new heading.
    const id = window.setTimeout(() => ref.current?.focus(), 0);
    return () => {
      window.clearTimeout(id);
    };
  }, [step, focusKey]);
  return (
    <h2 ref={ref} tabIndex={-1} className="exq-step-heading" data-state={step}>
      {number !== undefined ? (
        <span className="exq-step-heading__n" aria-hidden="true">
          {number}
        </span>
      ) : null}
      <span>{children}</span>
    </h2>
  );
}
