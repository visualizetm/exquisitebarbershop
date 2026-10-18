import { publicStaffListResponseSchema } from '@shared/api/public';
import { TodaysChairs } from '@/components/site/TodaysChairs';
import { ErrorState, SectionHead } from '@/components/ui';
import { useApi } from '@/lib/useApi';
import { usePageMeta } from '@/lib/usePageTitle';

export function ChairsPage() {
  usePageMeta({
    title: 'The chairs',
    description:
      'Meet the barbers and stylists at Exquisite Barber & Beauty Lounge in Brookhaven, PA. See who is in today and book a chair.',
  });
  const result = useApi('/api/staff', publicStaffListResponseSchema);
  return (
    <article className="exq-chairs exq-wrap exq-section" data-state={result.status}>
      <SectionHead label="The crew" title="Pick your chair" level={1} />
      {result.status === 'error' ? (
        <ErrorState>We could not load the team. Please try again.</ErrorState>
      ) : (
        <TodaysChairs
          staff={result.status === 'ready' ? result.data.staff : null}
          linkTo="profile"
          columns={3}
        />
      )}
    </article>
  );
}
