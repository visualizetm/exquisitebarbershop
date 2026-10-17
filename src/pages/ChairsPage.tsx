import { publicStaffListResponseSchema } from '@shared/api/public';
import { TodaysChairs } from '@/components/site/TodaysChairs';
import { ErrorState } from '@/components/ui';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';

export function ChairsPage() {
  usePageTitle('The Chairs');
  const result = useApi('/api/staff', publicStaffListResponseSchema);
  return (
    <article className="exq-chairs exq-wrap exq-section" data-state={result.status}>
      <p className="exq-label">Team</p>
      <h1 className="exq-chairs__title">The chairs</h1>
      {result.status === 'error' ? (
        <ErrorState>We could not load the team. Please try again.</ErrorState>
      ) : (
        <TodaysChairs
          staff={result.status === 'ready' ? result.data.staff : null}
          linkTo="profile"
          layout="grid"
        />
      )}
    </article>
  );
}
