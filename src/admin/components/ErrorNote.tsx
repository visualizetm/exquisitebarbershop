import { ApiRequestError } from '@/lib/api';

/** One place that turns an API error into a sentence, with field details when there are any. */
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong';
  const details = error instanceof ApiRequestError ? (error.details ?? []) : [];
  const code = error instanceof ApiRequestError ? error.code : 'UNKNOWN';
  return (
    <div className="exq-adm-error" data-state={code} role="alert">
      <p className="exq-adm-error__message">{message}</p>
      {details.length > 0 ? (
        <ul className="exq-adm-error__details">
          {details.map((d) => (
            <li key={`${d.path}:${d.message}`} className="exq-adm-error__detail">
              {d.path ? `${d.path}: ` : ''}
              {d.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
