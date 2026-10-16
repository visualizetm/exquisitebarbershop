import { useSearchParams } from 'react-router';
import { usePageTitle } from '@/lib/usePageTitle';

/** Booking flow lands here in the next prompt. The barber query parameter is already honored. */
export function BookPage() {
  usePageTitle('Book');
  const [params] = useSearchParams();
  const barber = params.get('barber');
  return (
    <article className="exq-book" data-state="coming-soon">
      <h1 className="exq-book__title">Book a chair</h1>
      {barber ? <p className="exq-book__preselected">Booking with {barber}.</p> : null}
      <p className="exq-book__notice">
        Online booking is almost ready. Call the shop to book for now.
      </p>
    </article>
  );
}
