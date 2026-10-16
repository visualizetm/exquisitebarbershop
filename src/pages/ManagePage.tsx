import { useSearchParams } from 'react-router';
import { usePageTitle } from '@/lib/usePageTitle';

/** Customer cancel and reschedule page, reached from the signed link in the confirmation email. */
export function ManagePage() {
  usePageTitle('Manage your booking');
  const [params] = useSearchParams();
  const hasToken = Boolean(params.get('token'));
  return (
    <article className="exq-manage" data-state={hasToken ? 'coming-soon' : 'missing-token'}>
      <h1 className="exq-manage__title">Manage your booking</h1>
      <p className="exq-manage__notice">
        {hasToken
          ? 'This page is almost ready.'
          : 'Open the link from your confirmation email to manage a booking.'}
      </p>
    </article>
  );
}
