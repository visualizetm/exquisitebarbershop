import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useParams } from 'react-router';
import { customerResponseSchema, type CustomerResponse } from '@shared/api/admin';
import { apiRequest } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { BookingList } from '../components/BookingList';
import { ErrorNote } from '../components/ErrorNote';
import { money, phoneLabel } from '../format';

/** There are no customer accounts: a customer is everyone who booked with one phone number. */
export function CustomersPage() {
  usePageTitle('Customers');
  const routePhone = useParams().phone ?? '';
  const [phone, setPhone] = useState(routePhone);
  const [result, setResult] = useState<CustomerResponse | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function lookup(event?: SyntheticEvent, value = phone) {
    event?.preventDefault();
    setWorking(true);
    setError(null);
    try {
      setResult(
        await apiRequest(
          `/api/admin/customers?phone=${encodeURIComponent(value)}`,
          customerResponseSchema,
        ),
      );
    } catch (err) {
      setResult(null);
      setError(err);
    } finally {
      setWorking(false);
    }
  }

  // Arriving from the search with a phone number in the address looks it up right away.
  useEffect(() => {
    if (routePhone) {
      setPhone(routePhone);
      void lookup(undefined, routePhone);
    }
  }, [routePhone]);

  return (
    <article
      className="exq-adm-customers"
      data-state={working ? 'working' : result ? 'found' : error ? 'error' : 'idle'}
    >
      <h1 className="exq-adm-customers__title">Customers</h1>
      <form className="exq-adm-customers__search" onSubmit={(e) => void lookup(e)}>
        <label htmlFor="exq-adm-customers-phone">Phone number</label>{' '}
        <input
          id="exq-adm-customers-phone"
          type="tel"
          required
          minLength={7}
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
        />{' '}
        <button type="submit" disabled={working}>
          Look up
        </button>
      </form>
      <ErrorNote error={error} />
      {result ? (
        <section className="exq-adm-customers__result" aria-labelledby="exq-adm-customer-name">
          <h2 id="exq-adm-customer-name">
            {result.names.length > 0 ? result.names.join(' / ') : 'No bookings yet'}
          </h2>
          <dl className="exq-adm-customers__facts">
            <dt>Phone</dt>
            <dd>{phoneLabel(result.phone)}</dd>
            {result.emails.length > 0 ? (
              <>
                <dt>Email</dt>
                <dd>{result.emails.join(', ')}</dd>
              </>
            ) : null}
            <dt>Visits completed</dt>
            <dd>{result.counts.completed}</dd>
            <dt>Upcoming</dt>
            <dd>{result.counts.upcoming}</dd>
            <dt>No shows</dt>
            <dd>{result.counts.noShow}</dd>
            <dt>Cancelled</dt>
            <dd>{result.counts.cancelled}</dd>
            <dt>Spent</dt>
            <dd>{money(result.completedSpendCents)}</dd>
          </dl>
          <BookingList bookings={result.bookings} linkBase="/admin/bookings" showDate />
        </section>
      ) : null}
    </article>
  );
}
