import { Link } from 'react-router';
import { todayResponseSchema } from '@shared/api/admin';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { money, shopDateLabel, shopTime } from '../format';

export function TodayPage() {
  usePageTitle('Today');
  const today = useApi('/api/admin/today', todayResponseSchema);

  if (today.status !== 'ready') {
    return (
      <article className="exq-adm-today" data-state={today.status}>
        <h1 className="exq-adm-today__title">Today</h1>
        <Status state={today.status} />
      </article>
    );
  }
  const t = today.data;
  return (
    <article className="exq-adm-today" data-state="ready">
      <h1 className="exq-adm-today__title">Today, {shopDateLabel(t.date)}</h1>
      {t.counts.newOnline > 0 ? (
        <p className="exq-adm-today__new" data-state="new">
          <Link to="/admin/bookings?source=online&status=confirmed">
            {t.counts.newOnline} new online {t.counts.newOnline === 1 ? 'booking' : 'bookings'} to
            review
          </Link>
        </p>
      ) : null}
      <dl className="exq-adm-today__stats">
        <dt>Chairs booked</dt>
        <dd data-stat="chairs-booked">
          {t.chairsBooked} of {t.chairsWorking} working
        </dd>
        <dt>Bookings</dt>
        <dd data-stat="bookings">{t.counts.total - t.counts.cancelled}</dd>
        <dt>Completed so far</dt>
        <dd data-stat="completed">{t.counts.completed}</dd>
        <dt>No shows</dt>
        <dd data-stat="no-show">{t.counts.noShow}</dd>
        <dt>Expected revenue</dt>
        <dd data-stat="expected-revenue">{money(t.expectedRevenueCents)}</dd>
        <dt>Completed revenue</dt>
        <dd data-stat="completed-revenue">{money(t.completedRevenueCents)}</dd>
      </dl>
      <section className="exq-adm-today__next" aria-labelledby="exq-adm-today-next">
        <h2 id="exq-adm-today-next">Next up</h2>
        {t.nextUp.length === 0 ? <p>No one is booked or working today.</p> : null}
        <ul className="exq-adm-today__next-list">
          {t.nextUp.map((n) => (
            <li
              key={n.staff.id}
              className="exq-adm-today__next-item"
              data-state={n.booking ? 'booked' : 'free'}
            >
              <span className="exq-adm-today__chair">{n.staff.name}</span>:{' '}
              {n.booking ? (
                <Link to={`/admin/bookings/${n.booking.id}`}>
                  {shopTime(n.booking.startAt)} {n.booking.customer.name}
                  {n.booking.isNew ? ' (new)' : ''}
                </Link>
              ) : (
                'nothing else booked'
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="exq-adm-today__in" aria-labelledby="exq-adm-today-in">
        <h2 id="exq-adm-today-in">Who's in</h2>
        <ul className="exq-adm-today__in-list">
          {t.whoIsIn.map((w) => (
            <li key={w.staff.id} className="exq-adm-today__in-item" data-state={w.status}>
              {w.staff.name}:{' '}
              {w.status === 'in'
                ? w.working.ranges
                    .map((r) => `${shopTime(r.startAt)} to ${shopTime(r.endAt)}`)
                    .join(', ')
                : w.status === 'closed'
                  ? 'shop closed'
                  : 'out'}
            </li>
          ))}
        </ul>
        <p>
          <Link to="/admin/whos-in">Change who's in</Link>{' '}
          <Link to="/admin/schedule">Open today's schedule</Link>
        </p>
      </section>
    </article>
  );
}
