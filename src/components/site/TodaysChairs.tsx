import { Link } from 'react-router';
import { nextOpeningsResponseSchema } from '@shared/api/availability';
import type { PublicStaff } from '@shared/api/public';
import { ChairCard, ChairCardSkeleton } from '@/components/ui';
import { chairStatusOf, inChairOrder } from '@/lib/chairStatus';
import { useApi } from '@/lib/useApi';

/**
 * The signature strip: one ChairCard per chair with today's status and next
 * open time. Each card links to /book for that chair. Sideways on phones, a
 * grid from 768px.
 */
export function TodaysChairs({
  staff,
  linkTo = 'book',
  layout = 'strip',
}: {
  staff: PublicStaff[] | null;
  /** Cards link to booking (home) or to the profile (the chairs page). */
  linkTo?: 'book' | 'profile';
  layout?: 'strip' | 'grid';
}) {
  const next = useApi('/api/availability/next', nextOpeningsResponseSchema);
  const className = layout === 'strip' ? 'exq-strip' : 'exq-grid';
  if (!staff || next.status === 'loading') {
    return (
      <ul
        className={`${className} exq-chairs__list`}
        data-state="loading"
        aria-busy="true"
        data-cols="2"
        data-lg="3"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <ChairCardSkeleton />
          </li>
        ))}
      </ul>
    );
  }
  const rows = next.status === 'ready' ? next.data.chairs : [];
  return (
    <>
      <ul className={`${className} exq-chairs__list`} data-state="ready" data-cols="2" data-lg="3">
        {inChairOrder(staff).map((member, i) => {
          const { status, label } = chairStatusOf(rows.find((r) => r.staff.id === member.id));
          return (
            <li
              key={member.id}
              className="exq-chair-card"
              data-state={member.acceptsOnlineBooking ? 'bookable' : 'walk-in'}
            >
              <ChairCard
                name={member.name}
                specialty={member.specialty || member.title}
                chairNumber={member.chairNumber}
                photo={member.photo ?? null}
                status={status}
                statusLabel={label}
                priority={i < 2}
                to={
                  linkTo === 'book'
                    ? `/book?barber=${encodeURIComponent(member.slug)}`
                    : `/chairs/${encodeURIComponent(member.slug)}`
                }
              />
            </li>
          );
        })}
      </ul>
      {next.status === 'error' ? (
        <p className="exq-chairs__fallback" data-state="error">
          <Link to="/chairs">See all chairs</Link>
        </p>
      ) : null}
    </>
  );
}
