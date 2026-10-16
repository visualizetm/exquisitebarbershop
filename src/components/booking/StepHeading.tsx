import { useEffect, useRef, type ReactNode } from 'react';

/** Step title that takes focus when it appears, so screen readers and keyboard users land on it. */
export function StepHeading({
  step,
  focusKey = '',
  children,
}: {
  step: string;
  /** Change it to pull focus back to the heading while staying on the same step. */
  focusKey?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [step, focusKey]);
  return (
    <h2 ref={ref} tabIndex={-1} className="exq-step-heading" data-state={step}>
      {children}
    </h2>
  );
}
