import { nextOpeningsResponseSchema } from '@shared/api/availability';
import type { PublicStaff } from '@shared/api/public';
import { ChairCard, ChairCardSkeleton, Link, Reveal } from '@/components/ui';
import { chairStatusOf, inChairOrder } from '@/lib/chairStatus';
import { useApi } from '@/lib/useApi';

/**
 * The signature strip: one ChairCard per chair with today's status and next open time. Sideways on
 * phones, a grid from 768px; each card rises in once as it scrolls into view.
 */
export function TodaysChairs({
  staff,
  linkTo = 'book',
  columns = 6,
}: {
  staff: PublicStaff[] | null;
  /** Cards link to booking (home) or to the profile (the chairs page). */
  linkTo?: 'book' | 'profile';
  /** Columns from 1024px: 6 on the home page, 3 on the chairs page. */
  columns?: 3 | 6;
}) {
  const next = useApi('/api/availability/next', nextOpeningsResponseSchema);
  if (!staff || next.status === 'loading') {
    return (
      <ul
        className="exq-strip exq-bare exq-chairs__list"
        data-state="loading"
        aria-busy="true"
        data-lg={columns}
      >
        {Array.from({ length: columns === 3 ? 3 : 6 }, (_, i) => (
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
      <ul className="exq-strip exq-bare exq-chairs__list" data-state="ready" data-lg={columns}>
        {inChairOrder(staff).map((member, i) => {
          const { status, label } = chairStatusOf(rows.find((r) => r.staff.id === member.id));
          return (
            <Reveal
              as="li"
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
            </Reveal>
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
