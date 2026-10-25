import { publicServicesResponseSchema, publicStaffListResponseSchema } from '@shared/api/public';
import { ServiceRows } from '@/components/site/ServiceRows';
import { ErrorState, SectionHead } from '@/components/ui';
import { Status } from '@/components/Status';
import { menuServices } from '@/lib/menuPrices';
import { useApi } from '@/lib/useApi';
import { usePageMeta } from '@/lib/usePageTitle';

export function ServicesPage() {
  usePageMeta({
    title: 'Services',
    description:
      'Barber and beauty services with prices at Exquisite Barber & Beauty Lounge in Brookhaven, PA. Book any service online.',
  });
  const services = useApi('/api/services', publicServicesResponseSchema);
  const staff = useApi('/api/staff', publicStaffListResponseSchema);
  // Barbers charge different prices for one service, so the menu shows the lowest ("From $x")
  // where they differ and the plain price where they do not. A chair page shows one person's own.
  const status =
    services.status === 'error' || staff.status === 'error'
      ? 'error'
      : services.status === 'ready' && staff.status === 'ready'
        ? 'ready'
        : 'loading';
  return (
    <article className="exq-services exq-band exq-dark" data-state={status}>
      <div className="exq-wrap exq-section">
        <SectionHead label="The menu" title="Services" level={1} />
        {status === 'loading' ? <Status state="loading" /> : null}
        {status === 'error' ? (
          <ErrorState>We could not load the menu. Please try again.</ErrorState>
        ) : null}
        {services.status === 'ready' && staff.status === 'ready' ? (
          <ServiceRows services={menuServices(services.data.services, staff.data.staff)} />
        ) : null}
      </div>
    </article>
  );
}
