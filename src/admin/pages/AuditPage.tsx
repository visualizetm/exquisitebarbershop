import type { SyntheticEvent } from 'react';
import { useSearchParams } from 'react-router';
import { auditListResponseSchema, type AuditEntryView } from '@shared/api/admin';
import { Status } from '@/components/Status';
import { usePageTitle } from '@/lib/usePageTitle';
import { ErrorNote } from '../components/ErrorNote';
import { shopDateTime } from '../format';
import { usePagedList } from '../usePagedList';

const pickEntries = (page: { entries: AuditEntryView[] }) => page.entries;
const FILTER_KEYS = ['action', 'entityType', 'entityId', 'actorType', 'from', 'to'] as const;

function summary(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = JSON.stringify(value);
  return text.length > 200 ? `${text.slice(0, 200)}...` : text;
}

/** Every change and sign-in attempt, newest first. Passwords are never recorded. */
export function AuditPage() {
  usePageTitle('Audit log');
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const list = usePagedList('/api/admin/audit', query, auditListResponseSchema, pickEntries);

  function apply(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = data.get(key);
      if (typeof value === 'string' && value.trim()) next.set(key, value.trim());
    }
    setParams(next);
  }

  return (
    <article className="exq-adm-audit" data-state={list.status}>
      <h1 className="exq-adm-audit__title">Audit log</h1>
      <form className="exq-adm-audit__filters" onSubmit={apply} key={query}>
        <p>
          <label htmlFor="exq-adm-audit-action">Action starts with</label>{' '}
          <input
            id="exq-adm-audit-action"
            name="action"
            placeholder="booking. or auth.login"
            defaultValue={params.get('action') ?? ''}
          />{' '}
          <label htmlFor="exq-adm-audit-actor">By</label>{' '}
          <select
            id="exq-adm-audit-actor"
            name="actorType"
            defaultValue={params.get('actorType') ?? ''}
          >
            <option value="">Anyone</option>
            <option value="owner">Owner</option>
            <option value="barber">Barber</option>
            <option value="customer">Customer</option>
            <option value="system">System</option>
          </select>
        </p>
        <p>
          <label htmlFor="exq-adm-audit-type">Record type</label>{' '}
          <input
            id="exq-adm-audit-type"
            name="entityType"
            placeholder="booking"
            defaultValue={params.get('entityType') ?? ''}
          />{' '}
          <label htmlFor="exq-adm-audit-id">Record id</label>{' '}
          <input
            id="exq-adm-audit-id"
            name="entityId"
            defaultValue={params.get('entityId') ?? ''}
          />
        </p>
        <p>
          <label htmlFor="exq-adm-audit-from">From</label>{' '}
          <input
            id="exq-adm-audit-from"
            name="from"
            type="date"
            defaultValue={params.get('from') ?? ''}
          />{' '}
          <label htmlFor="exq-adm-audit-to">To</label>{' '}
          <input
            id="exq-adm-audit-to"
            name="to"
            type="date"
            defaultValue={params.get('to') ?? ''}
          />
        </p>
        <button type="submit">Filter</button>
      </form>
      {list.status === 'loading' ? <Status state="loading" /> : null}
      <ErrorNote error={list.error} />
      {list.status === 'ready' && list.rows.length === 0 ? <Status state="empty" /> : null}
      <ol className="exq-adm-audit__list">
        {list.rows.map((e) => (
          <li
            key={e.id}
            className="exq-adm-audit__entry"
            data-state={e.actor.type}
            data-action={e.action}
          >
            <span className="exq-adm-audit__at">{shopDateTime(e.at)}</span>{' '}
            <span className="exq-adm-audit__action">{e.action}</span>{' '}
            <span className="exq-adm-audit__actor">by {e.actor.type}</span>{' '}
            <span className="exq-adm-audit__entity">
              {e.entityType} {e.entityId}
            </span>
            {e.before !== null || e.after !== null || e.meta !== null ? (
              <details className="exq-adm-audit__detail">
                <summary>Details</summary>
                {e.before !== null ? <p>Before: {summary(e.before)}</p> : null}
                {e.after !== null ? <p>After: {summary(e.after)}</p> : null}
                {e.meta !== null ? <p>Info: {summary(e.meta)}</p> : null}
              </details>
            ) : null}
          </li>
        ))}
      </ol>
      {list.hasMore ? (
        <button type="button" className="exq-adm-audit__more" onClick={() => void list.loadMore()}>
          Load more
        </button>
      ) : null}
    </article>
  );
}
