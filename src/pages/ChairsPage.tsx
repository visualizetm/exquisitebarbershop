import { Link } from 'react-router';
import { publicStaffListResponseSchema } from '@shared/api/public';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';

export function ChairsPage() {
  usePageTitle('The Chairs');
  const result = useApi('/api/staff', publicStaffListResponseSchema);
  return (
    <article className="exq-chairs" data-state={result.status}>
      <h1 className="exq-chairs__title">The Chairs</h1>
      {result.status === 'loading' ? <Status state="loading" /> : null}
      {result.status === 'error' ? <Status state="error" /> : null}
      {result.status === 'ready' ? (
        <ul className="exq-chairs__list">
          {result.data.staff.map((member) => (
            <li
              key={member.id}
              className="exq-chair-card"
              data-state={member.acceptsOnlineBooking ? 'bookable' : 'walk-in'}
            >
              <h2 className="exq-chair-card__name">
                <Link to={`/chairs/${member.slug}`}>{member.name}</Link>
              </h2>
              <p className="exq-chair-card__title">{member.title}</p>
              {member.chairNumber !== null ? (
                <p className="exq-chair-card__chair">Chair {member.chairNumber}</p>
              ) : null}
              {member.specialty ? (
                <p className="exq-chair-card__specialty">{member.specialty}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
