import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { publicStaffResponseSchema } from '@shared/api/public';
import { Status } from '@/components/Status';
import { ApiRequestError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';

export function ChairPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const result = useApi(
    slug ? `/api/staff/${encodeURIComponent(slug)}` : null,
    publicStaffResponseSchema,
  );
  usePageTitle(result.status === 'ready' ? result.data.staff.name : 'The Chairs');

  // An old slug (from a printed card) resolves, then the address is replaced with the current one.
  useEffect(() => {
    if (result.status === 'ready' && !result.data.canonical) {
      void navigate(`/chairs/${result.data.staff.slug}`, { replace: true });
    }
  }, [result, navigate]);

  if (result.status === 'loading') return <Status state="loading" />;
  if (result.status === 'error') {
    const notFound = result.error instanceof ApiRequestError && result.error.status === 404;
    return (
      <article className="exq-chair" data-state="error">
        <Status state="error" message={notFound ? 'That chair is no longer listed.' : undefined} />
        <p>
          <Link to="/chairs">See all chairs</Link>
        </p>
      </article>
    );
  }
  const { staff } = result.data;
  return (
    <article className="exq-chair" data-state="ready">
      <h1 className="exq-chair__name">{staff.name}</h1>
      <p className="exq-chair__title">{staff.title}</p>
      {staff.chairNumber !== null ? (
        <p className="exq-chair__chair">Chair {staff.chairNumber}</p>
      ) : null}
      {staff.specialty ? <p className="exq-chair__specialty">{staff.specialty}</p> : null}
      {staff.bio ? <p className="exq-chair__bio">{staff.bio}</p> : null}
      {staff.instagramHandle ? (
        <p className="exq-chair__social">
          <a
            href={`https://instagram.com/${staff.instagramHandle}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            @{staff.instagramHandle}
          </a>
        </p>
      ) : null}
      <p className="exq-chair__actions">
        {staff.acceptsOnlineBooking ? (
          <Link
            to={`/book?barber=${encodeURIComponent(staff.slug)}`}
            className="exq-button exq-button--primary"
          >
            Book with {staff.name}
          </Link>
        ) : (
          <span className="exq-chair__walk-in">Walk-ins only</span>
        )}
      </p>
    </article>
  );
}
