import { useState } from 'react';
import type { PublicService } from '@shared/api/public';
import { priceLabel } from '@shared/lib/money';
import { Chip, Chips, PriceRow, Reveal } from '@/components/ui';

type Group = 'all' | PublicService['group'];
const GROUPS: PublicService['group'][] = ['Barber', 'Beauty'];

function Row({ service, description }: { service: PublicService; description: boolean }) {
  return (
    <Reveal as="li" className="exq-service" data-state={service.priceFrom ? 'from' : 'fixed'}>
      <PriceRow
        name={service.name}
        description={description ? service.description : undefined}
        meta={`${String(service.durationMinutes)} min`}
        price={priceLabel(service)}
        to={`/book?service=${encodeURIComponent(service.id)}`}
        label={`Book ${service.name}, ${String(service.durationMinutes)} minutes, ${priceLabel(service)}`}
      />
    </Reveal>
  );
}

/**
 * The service menu. "menu": group chips with counts, then one block per group (its name over a rule)
 * with a PriceRow each. "preview": the first few rows only, for the home page. Every row books that
 * service.
 */
export function ServiceRows({
  services,
  limit,
  showDescription = true,
}: {
  services: PublicService[];
  /** With a limit the list is the short preview: no chips, no group names. */
  limit?: number;
  showDescription?: boolean;
}) {
  const [group, setGroup] = useState<Group>('all');
  if (limit !== undefined) {
    return (
      <ul className="exq-services__list exq-bare" data-state="preview">
        {services.slice(0, limit).map((service) => (
          <Row key={service.id} service={service} description={showDescription} />
        ))}
      </ul>
    );
  }
  const count = (g: Group) =>
    (g === 'all' ? services : services.filter((s) => s.group === g)).length;
  return (
    <div className="exq-services__menu" data-state={group}>
      <Chips label="Service groups">
        {(['all', ...GROUPS] as const).map((g) => (
          <Chip
            key={g}
            selected={group === g}
            count={count(g)}
            onClick={() => {
              setGroup(g);
            }}
          >
            {g === 'all' ? 'All' : g}
          </Chip>
        ))}
      </Chips>
      {GROUPS.filter((g) => group === 'all' || group === g).map((g) => {
        const items = services.filter((s) => s.group === g);
        if (items.length === 0) return null;
        return (
          <section key={g} className="exq-menugroup" aria-labelledby={`exq-menu-${g}`}>
            <h2 id={`exq-menu-${g}`} className="exq-label exq-menugroup__title">
              {g}
            </h2>
            <ul className="exq-services__list exq-bare">
              {items.map((service) => (
                <Row key={service.id} service={service} description={showDescription} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
