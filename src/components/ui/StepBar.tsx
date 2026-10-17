export interface Step<K extends string> {
  key: K;
  label: string;
}

/** Progress across a flow. Done steps are buttons that go back; later steps are inert. */
export function StepBar<K extends string>({
  steps,
  current,
  onJump,
}: {
  steps: readonly Step<K>[];
  current: K;
  onJump?: (key: K) => void;
}) {
  const index = steps.findIndex((s) => s.key === current);
  return (
    <ol className="exq-stepbar" aria-label="Steps">
      {steps.map((step, i) => {
        const state = i < index ? 'done' : i === index ? 'current' : 'todo';
        return (
          <li key={step.key} className="exq-stepbar__step" data-state={state}>
            <button
              type="button"
              className="exq-stepbar__button"
              aria-current={state === 'current' ? 'step' : undefined}
              disabled={state !== 'done' || !onJump}
              onClick={() => onJump?.(step.key)}
            >
              <span className="exq-stepbar__bar" aria-hidden="true" />
              <span className="exq-stepbar__label">
                <span className="exq-visually-hidden">Step {i + 1}: </span>
                {step.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
