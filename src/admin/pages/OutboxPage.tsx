import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { okResponseSchema } from '@shared/api/auth';
import { outboxListResponseSchema, type OutboxMessageView } from '@shared/api/admin';
import { Status } from '@/components/Status';
import { apiRequest } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorNote } from '../components/ErrorNote';
import { shopDateTime } from '../format';
import { usePagedList } from '@/lib/usePagedList';

const pickMessages = (page: { messages: OutboxMessageView[] }) => page.messages;

/** Every email the system queued, with a retry for the ones that gave up. */
export function OutboxPage() {
  usePageTitle('Email outbox');
  const [params, setParams] = useSearchParams();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const query = params.toString();
  const list = usePagedList(
    '/api/admin/outbox',
    query,
    outboxListResponseSchema,
    pickMessages,
    version,
  );

  async function retry(id: string) {
    setRetrying(id);
    setError(null);
    try {
      await apiRequest(`/api/admin/outbox/${id}/retry`, okResponseSchema, {
        method: 'POST',
        body: {},
      });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err);
    } finally {
      setRetrying(null);
    }
  }

  return (
    <article className="exq-adm-outbox" data-state={list.status}>
      <h1 className="exq-adm-outbox__title">Email outbox</h1>
      <p className="exq-adm-outbox__filter">
        <label htmlFor="exq-adm-outbox-status">Show</label>{' '}
        <select
          id="exq-adm-outbox-status"
          value={params.get('status') ?? ''}
          onChange={(e) => {
            setParams(e.target.value ? { status: e.target.value } : {});
          }}
        >
          <option value="">All</option>
          <option value="pending">Waiting</option>
          <option value="sending">Sending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
      </p>
      {list.status === 'loading' ? <Status state="loading" /> : null}
      <ErrorNote error={list.error ?? error} />
      {list.status === 'ready' && list.rows.length === 0 ? <Status state="empty" /> : null}
      <ol className="exq-adm-outbox__list">
        {list.rows.map((m) => (
          <li key={m.id} className="exq-adm-outbox__message" data-state={m.status}>
            <span className="exq-adm-outbox__when">{shopDateTime(m.createdAt)}</span>{' '}
            <span className="exq-adm-outbox__template">{m.template}</span>{' '}
            <span className="exq-adm-outbox__to">to {m.to}</span>{' '}
            <span className="exq-adm-outbox__status">
              {m.status}
              {m.status === 'sent' && m.sentAt ? ` ${shopDateTime(m.sentAt)}` : ''}, attempt{' '}
              {m.attempts} of {m.maxAttempts}
            </span>
            {m.lastError ? <span className="exq-adm-outbox__error"> ({m.lastError})</span> : null}
            {m.status === 'failed' ? (
              <>
                {' '}
                <button
                  type="button"
                  className="exq-adm-outbox__retry"
                  disabled={retrying === m.id}
                  onClick={() => void retry(m.id)}
                >
                  Retry
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ol>
      {list.hasMore ? (
        <button type="button" className="exq-adm-outbox__more" onClick={() => void list.loadMore()}>
          Load more
        </button>
      ) : null}
    </article>
  );
}
