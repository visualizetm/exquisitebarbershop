import { nextOpeningsResponseSchema } from '@shared/api/availability';
import type { PublicStaff } from '@shared/api/public';
import { ChairCard, ChairCardSkeleton, Link, Reveal } from '@/components/ui';
import { chairStatusOf, inChairOrder } from '@/lib/chairStatus';
import { offlineBooking } from '@/lib/offlineBooking';
import { useApi } from '@/lib/useApi';
import { useCarousel } from './useCarousel';

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
  const ordered = staff ? inChairOrder(staff) : [];
  const carousel = useCarousel(ordered.length, Boolean(staff) && next.status !== 'loading');
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
    <div className="exq-carousel" role="region" aria-label="Today's chairs carousel">
      <ul
        ref={carousel.ref}
        className="exq-strip exq-bare exq-chairs__list"
        data-state="ready"
        data-lg={columns}
      >
        {ordered.map((member, i) => {
          // A chair without online booking shows where to book instead of an open time.
          const away = offlineBooking(member);
          const { status, label } = away
            ? { status: 'none' as const, label: away.label }
            : chairStatusOf(rows.find((r) => r.staff.id === member.id));
          const profile = `/chairs/${encodeURIComponent(member.slug)}`;
          return (
            <Reveal
              as="li"
              key={member.id}
              className="exq-chair-card"
              data-state={
                member.acceptsOnlineBooking ? 'bookable' : away?.href ? 'instagram' : 'walk-in'
              }
            >
              <ChairCard
                name={member.name}
                specialty={member.specialty || member.title}
                chairNumber={member.chairNumber}
                photo={member.photo ?? null}
                status={status}
                statusLabel={label}
                priority={i < 2}
                {...(linkTo === 'book' && away?.href
                  ? { href: away.href }
                  : {
                      to:
                        linkTo === 'book' && !away
                          ? `/book?barber=${encodeURIComponent(member.slug)}`
                          : profile,
                    })}
              />
            </Reveal>
          );
        })}
      </ul>
      {ordered.length > 1 ? (
        <div className="exq-carousel__dots" role="group" aria-label="Choose a chair to show">
          {ordered.map((member, i) => (
            <button
              key={member.id}
              type="button"
              className="exq-carousel__dot"
              aria-label={`Show ${member.name}`}
              aria-current={i === carousel.index ? 'true' : undefined}
              onClick={() => {
                carousel.goTo(i);
              }}
            />
          ))}
        </div>
      ) : null}
      {next.status === 'error' ? (
        <p className="exq-chairs__fallback" data-state="error">
          <Link to="/chairs">See all chairs</Link>
        </p>
      ) : null}
    </div>
  );
}
