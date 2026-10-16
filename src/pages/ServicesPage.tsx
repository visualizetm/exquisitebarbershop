import { publicServicesResponseSchema, type PublicService } from '@shared/api/public';
import { priceLabel } from '@shared/lib/money';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';

function ServiceGroup({ title, services }: { title: string; services: PublicService[] }) {
  if (services.length === 0) return null;
  return (
    <section
      className="exq-services__group"
      aria-labelledby={`exq-services-${title.toLowerCase()}`}
    >
      <h2 id={`exq-services-${title.toLowerCase()}`} className="exq-services__group-title">
        {title}
      </h2>
      <ul className="exq-services__list">
        {services.map((service) => (
          <li
            key={service.id}
            className="exq-service"
            data-state={service.priceFrom ? 'from' : 'fixed'}
          >
            <h3 className="exq-service__name">{service.name}</h3>
            {service.description ? (
              <p className="exq-service__description">{service.description}</p>
            ) : null}
            <p className="exq-service__meta">
              <span className="exq-service__price">{priceLabel(service)}</span>
              <span className="exq-service__duration">{service.durationMinutes} min</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ServicesPage() {
  usePageTitle('Services');
  const result = useApi('/api/services', publicServicesResponseSchema);
  return (
    <article className="exq-services" data-state={result.status}>
      <h1 className="exq-services__title">Services</h1>
      {result.status === 'loading' ? <Status state="loading" /> : null}
      {result.status === 'error' ? <Status state="error" /> : null}
      {result.status === 'ready' ? (
        <>
          <ServiceGroup
            title="Barber"
            services={result.data.services.filter((s) => s.group === 'Barber')}
          />
          <ServiceGroup
            title="Beauty"
            services={result.data.services.filter((s) => s.group === 'Beauty')}
          />
        </>
      ) : null}
    </article>
  );
}
