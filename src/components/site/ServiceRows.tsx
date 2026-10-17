import { useState } from 'react';
import { Link } from 'react-router';
import type { PublicService } from '@shared/api/public';
import { priceLabel } from '@shared/lib/money';
import { Chip, Chips } from '@/components/ui';

type Group = 'all' | PublicService['group'];

/**
 * The service menu: group chips with counts and one row per service with its
 * duration, price and a Book link. `limit` keeps the home preview short.
 */
export function ServiceRows({
  services,
  limit,
  showDescription = true,
}: {
  services: PublicService[];
  limit?: number;
  showDescription?: boolean;
}) {
  const [group, setGroup] = useState<Group>('all');
  const count = (g: Group) =>
    (g === 'all' ? services : services.filter((s) => s.group === g)).length;
  const shown = (group === 'all' ? services : services.filter((s) => s.group === group)).slice(
    0,
    limit ?? services.length,
  );
  return (
    <div className="exq-services__menu" data-state={group}>
      <Chips label="Service groups">
        {(['all', 'Barber', 'Beauty'] as const).map((g) => (
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
      <ul className="exq-services__list">
        {shown.map((service) => (
          <li
            key={service.id}
            className="exq-service"
            data-state={service.priceFrom ? 'from' : 'fixed'}
          >
            <Link
              to={`/book?service=${encodeURIComponent(service.id)}`}
              className="exq-service__row"
              aria-label={`Book ${service.name}, ${service.durationMinutes} minutes, ${priceLabel(service)}`}
            >
              <span className="exq-service__main">
                <span className="exq-service__name">{service.name}</span>
                {showDescription && service.description ? (
                  <span className="exq-service__description">{service.description}</span>
                ) : null}
              </span>
              <span className="exq-service__meta">
                <span className="exq-service__duration">{service.durationMinutes} min</span>
                <span className="exq-service__price exq-price">{priceLabel(service)}</span>
                <span className="exq-service__book">Book</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
