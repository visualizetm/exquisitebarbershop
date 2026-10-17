import type { SyntheticEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  bookingListResponseSchema,
  staffListResponseSchema,
  type AdminBookingView,
} from '@shared/api/admin';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { BookingList } from '../components/BookingList';
import { ErrorNote } from '../components/ErrorNote';
import { usePagedList } from '../usePagedList';

const pickBookings = (page: { bookings: AdminBookingView[] }) => page.bookings;

const FILTER_KEYS = ['from', 'to', 'staffId', 'status', 'source', 'q'] as const;

/** Every booking, filtered by date range, chair, status, source and a search box. */
export function BookingsPage() {
  usePageTitle('Bookings');
  const [params, setParams] = useSearchParams();
  const staff = useApi('/api/admin/staff', staffListResponseSchema);
  const filterQuery = params.toString();
  const list = usePagedList(
    '/api/admin/bookings',
    filterQuery,
    bookingListResponseSchema,
    pickBookings,
  );

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
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
    <article className="exq-adm-list" data-state={list.status}>
      <h1 className="exq-adm-list__title">Bookings</h1>
      <form className="exq-adm-list__filters" onSubmit={applyFilters} key={filterQuery}>
        <p>
          <label htmlFor="exq-adm-list-q">Search name, phone or reference</label>{' '}
          <input id="exq-adm-list-q" name="q" type="search" defaultValue={params.get('q') ?? ''} />
        </p>
        <p>
          <label htmlFor="exq-adm-list-from">From</label>{' '}
          <input
            id="exq-adm-list-from"
            name="from"
            type="date"
            defaultValue={params.get('from') ?? ''}
          />{' '}
          <label htmlFor="exq-adm-list-to">To</label>{' '}
          <input id="exq-adm-list-to" name="to" type="date" defaultValue={params.get('to') ?? ''} />
        </p>
        <p>
          <label htmlFor="exq-adm-list-staff">Chair</label>{' '}
          <select id="exq-adm-list-staff" name="staffId" defaultValue={params.get('staffId') ?? ''}>
            <option value="">All</option>
            {staff.status === 'ready'
              ? staff.data.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              : null}
          </select>{' '}
          <label htmlFor="exq-adm-list-status">Status</label>{' '}
          <select id="exq-adm-list-status" name="status" defaultValue={params.get('status') ?? ''}>
            <option value="">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="noShow">No show</option>
            <option value="cancelled">Cancelled</option>
          </select>{' '}
          <label htmlFor="exq-adm-list-source">Source</label>{' '}
          <select id="exq-adm-list-source" name="source" defaultValue={params.get('source') ?? ''}>
            <option value="">All</option>
            <option value="online">Online</option>
            <option value="phone">Phone</option>
            <option value="walkIn">Walk-in</option>
          </select>
        </p>
        <button type="submit" className="exq-adm-list__apply">
          Show bookings
        </button>
      </form>
      {list.status === 'loading' ? <Status state="loading" /> : null}
      <ErrorNote error={list.error} />
      {list.status === 'ready' ? (
        <BookingList bookings={list.rows} linkBase="/admin/bookings" showDate />
      ) : null}
      {list.hasMore ? (
        <button type="button" className="exq-adm-list__more" onClick={() => void list.loadMore()}>
          Load more
        </button>
      ) : null}
    </article>
  );
}
