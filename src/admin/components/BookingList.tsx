import { Link } from 'react-router';
import type { AdminBookingView } from '@shared/api/admin';
import { SOURCE_LABEL, STATUS_LABEL, money, shopDateTime, shopTime } from '../format';

/** A compact list of bookings, each linking to its detail screen. */
export function BookingList({
  bookings,
  linkBase,
  showDate = false,
  showChair = true,
}: {
  bookings: AdminBookingView[];
  /** "/admin/bookings" for the owner, "/admin/me/bookings" for a barber. */
  linkBase: string;
  showDate?: boolean;
  showChair?: boolean;
}) {
  if (bookings.length === 0) {
    return (
      <p className="exq-adm-bookings__empty" data-state="empty">
        No bookings.
      </p>
    );
  }
  return (
    <ol className="exq-adm-bookings" data-state="list">
      {bookings.map((b) => (
        <li
          key={b.id}
          className="exq-adm-bookings__item"
          data-state={b.status}
          data-new={b.isNew ? 'true' : 'false'}
          data-source={b.source}
        >
          <Link className="exq-adm-bookings__link" to={`${linkBase}/${b.id}`}>
            <span className="exq-adm-bookings__time">
              {showDate ? shopDateTime(b.startAt) : shopTime(b.startAt)}
            </span>{' '}
            <span className="exq-adm-bookings__customer">{b.customer.name}</span>{' '}
            <span className="exq-adm-bookings__services">
              {b.services.map((s) => s.name).join(', ')}
            </span>
            {showChair ? (
              <>
                {' '}
                <span className="exq-adm-bookings__chair">with {b.staff.name}</span>
              </>
            ) : null}{' '}
            <span className="exq-adm-bookings__price">{money(b.totalPriceCents)}</span>{' '}
            <span className="exq-adm-bookings__status" data-state={b.status}>
              {STATUS_LABEL[b.status]}
            </span>
            {b.source !== 'online' ? (
              <>
                {' '}
                <span className="exq-adm-bookings__source">{SOURCE_LABEL[b.source]}</span>
              </>
            ) : null}
            {b.isNew ? (
              <>
                {' '}
                <strong className="exq-adm-bookings__new" data-state="new">
                  New
                </strong>
              </>
            ) : null}
          </Link>
        </li>
      ))}
    </ol>
  );
}
