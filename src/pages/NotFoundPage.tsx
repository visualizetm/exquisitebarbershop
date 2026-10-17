import { ButtonLink, EmptyState } from '@/components/ui';
import { usePageMeta } from '@/lib/usePageTitle';

export function NotFoundPage() {
  usePageMeta({ title: 'Page not found', noindex: true });
  return (
    <article className="exq-not-found exq-wrap exq-section" data-state="not-found">
      <h1 className="exq-not-found__title">Page not found</h1>
      <EmptyState
        title="That page is not here"
        action={<ButtonLink to="/">Back to the home page</ButtonLink>}
      >
        Check the address, or start from the home page.
      </EmptyState>
    </article>
  );
}
