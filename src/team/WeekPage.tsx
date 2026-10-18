import { teamWeekResponseSchema } from '@shared/api/team';
import { EmptyState, ErrorState, StatusChip } from '@/components/ui';
import { Status } from '@/components/Status';
import { usePageTitle } from '@/lib/usePageTitle';
import { shopDateLabel, shopTime } from '@/admin/format';
import { useTeamApi } from './useTeamSession';

/** The next seven days, one block per day with a count, so a gap or a crowded day is easy to see. */
export function WeekPage() {
  usePageTitle('This week');
  const week = useTeamApi('/api/team/week', teamWeekResponseSchema);
  if (week.status === 'loading') return <Status state="loading" />;
  if (week.status === 'error') {
    return (
      <ErrorState title="The week did not load">Check the connection and try again.</ErrorState>
    );
  }
  return (
    <div className="exq-team-page">
      <header className="exq-team-head">
        <div>
          <h1>This week</h1>
          <p className="exq-muted">The next 7 days</p>
        </div>
      </header>
      <ol className="exq-team-days exq-bare">
        {week.data.days.map((day) => (
          <li key={day.date} className="exq-team-day" data-state={day.count > 0 ? 'busy' : 'free'}>
            <h2 className="exq-team-day__head">
              <span>{shopDateLabel(day.date)}</span>
              <span className="exq-team-day__count">
                {day.working.ranges.length === 0 && day.count === 0
                  ? 'Off'
                  : `${String(day.count)} ${day.count === 1 ? 'client' : 'clients'}`}
              </span>
            </h2>
            {day.bookings.length > 0 ? (
              <ul className="exq-team-list exq-bare">
                {day.bookings.map((b) => (
                  <li
                    key={b.id}
                    className="exq-team-row exq-team-row--static"
                    data-state={b.status}
                  >
                    <span className="exq-team-row__time">{shopTime(b.startAt)}</span>
                    <span className="exq-team-row__body">
                      <strong>{b.customerName}</strong>
                      <span>{b.services.join(', ')}</span>
                    </span>
                    {b.status === 'confirmed' ? null : <StatusChip status={b.status} />}
                  </li>
                ))}
              </ul>
            ) : null}
            {day.blocks.length > 0 ? (
              <p className="exq-muted">
                {day.blocks
                  .map((b) =>
                    b.kind === 'dayOff' || b.kind === 'timeOff'
                      ? 'Time off'
                      : `Blocked ${shopTime(b.startAt)} to ${shopTime(b.endAt)}`,
                  )
                  .join(', ')}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {week.data.days.every((d) => d.count === 0) ? (
        <EmptyState title="Nothing booked yet">
          New bookings show up here as they come in.
        </EmptyState>
      ) : null}
    </div>
  );
}
