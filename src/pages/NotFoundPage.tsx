import { Link } from 'react-router';
import { usePageTitle } from '@/lib/usePageTitle';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <article className="exq-not-found" data-state="not-found">
      <h1 className="exq-not-found__title">Page not found</h1>
      <p>
        <Link to="/">Back to the home page</Link>
      </p>
    </article>
  );
}
