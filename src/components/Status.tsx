/** Loading and error placeholders. One component, state carried on data-state for styling. */
export function Status({
  state,
  message,
}: {
  state: 'loading' | 'error' | 'empty';
  message?: string | undefined;
}) {
  const text =
    message ??
    (state === 'loading'
      ? 'Loading'
      : state === 'error'
        ? 'Something went wrong. Please try again.'
        : 'Nothing to show yet.');
  return (
    <p className="exq-status" data-state={state} role={state === 'error' ? 'alert' : 'status'}>
      {text}
    </p>
  );
}
