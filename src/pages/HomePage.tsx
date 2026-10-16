import { Link } from 'react-router';
import { usePageTitle } from '@/lib/usePageTitle';

export function HomePage() {
  usePageTitle(null);
  return (
    <article className="exq-home">
      <section className="exq-home__hero">
        <h1 className="exq-home__title">Gifted Hands</h1>
        <p className="exq-home__lead">
          Barbers and stylists under one roof in Brookhaven, PA. Pick your chair and book online in
          under a minute.
        </p>
        <p className="exq-home__actions">
          <Link to="/book" className="exq-button exq-button--primary">
            Book now
          </Link>
          <Link to="/chairs" className="exq-button">
            Meet the chairs
          </Link>
        </p>
      </section>
    </article>
  );
}
