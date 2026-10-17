import { publicServicesResponseSchema } from '@shared/api/public';
import { ServiceRows } from '@/components/site/ServiceRows';
import { ErrorState } from '@/components/ui';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageMeta } from '@/lib/usePageTitle';

export function ServicesPage() {
  usePageMeta({
    title: 'Services',
    description:
      'Barber and beauty services with prices at Exquisite Barber & Beauty Lounge in Brookhaven, PA. Book any service online.',
  });
  const result = useApi('/api/services', publicServicesResponseSchema);
  return (
    <article className="exq-services exq-wrap exq-section" data-state={result.status}>
      <p className="exq-label">Menu</p>
      <h1 className="exq-services__title">Services</h1>
      {result.status === 'loading' ? <Status state="loading" /> : null}
      {result.status === 'error' ? (
        <ErrorState>We could not load the menu. Please try again.</ErrorState>
      ) : null}
      {result.status === 'ready' ? <ServiceRows services={result.data.services} /> : null}
    </article>
  );
}
