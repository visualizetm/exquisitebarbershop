import { usePageTitle } from '@/lib/usePageTitle';

/** Owner dashboard and barber schedule land here in a later prompt. */
export function AdminPage() {
  usePageTitle('Staff');
  return (
    <article className="exq-admin" data-state="coming-soon">
      <h1 className="exq-admin__title">Staff sign in</h1>
      <p className="exq-admin__notice">The dashboard is not available yet.</p>
    </article>
  );
}
