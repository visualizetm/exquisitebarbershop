import type { PublicService } from '@shared/api/public';
import { formatCents, priceLabel } from '@shared/lib/money';
import { Button, StickyCTA } from '@/components/ui';

export interface ServicePickerProps {
  services: PublicService[];
  selected: string[];
  max: number;
  onChange: (selected: string[]) => void;
  onContinue: () => void;
}

/** Services as selectable rows with price and duration. The total rides in a sticky bar on phones. */
export function ServicePicker({
  services,
  selected,
  max,
  onChange,
  onContinue,
}: ServicePickerProps) {
  const chosen = services.filter((s) => selected.includes(s.id));
  const totalCents = chosen.reduce((sum, s) => sum + s.priceCents, 0);
  const totalMinutes = chosen.reduce((sum, s) => sum + s.durationMinutes, 0);
  const anyFrom = chosen.some((s) => s.priceFrom);
  const full = selected.length >= max;
  const totalLabel = `${anyFrom ? 'From ' : ''}${formatCents(totalCents)}`;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const groups: PublicService['group'][] = ['Barber', 'Beauty'];
  return (
    <div
      className="exq-service-picker"
      data-state={selected.length === 0 ? 'empty' : full ? 'full' : 'partial'}
    >
      {groups.map((group) => {
        const items = services.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <fieldset key={group} className="exq-service-picker__group">
            <legend className="exq-service-picker__legend exq-label">{group}</legend>
            <ul className="exq-service-picker__list">
              {items.map((service) => {
                const checked = selected.includes(service.id);
                const disabled = !checked && full;
                return (
                  <li
                    key={service.id}
                    className="exq-service-option"
                    data-state={checked ? 'selected' : disabled ? 'disabled' : 'idle'}
                  >
                    <label className="exq-service-option__label">
                      <input
                        type="checkbox"
                        className="exq-service-option__input"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => {
                          toggle(service.id);
                        }}
                      />
                      <span className="exq-service-option__check" aria-hidden="true" />
                      <span className="exq-service-option__text">
                        <span className="exq-service-option__name">{service.name}</span>
                        {service.description ? (
                          <span className="exq-service-option__description">
                            {service.description}
                          </span>
                        ) : null}
                      </span>
                      <span className="exq-service-option__meta">
                        <span className="exq-service-option__duration">
                          {service.durationMinutes} min
                        </span>
                        <span className="exq-service-option__price exq-price">
                          {priceLabel(service)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
      <p className="exq-service-picker__hint exq-muted">Choose up to {max} services.</p>
      <p className="exq-service-picker__total" aria-live="polite">
        {chosen.length === 0
          ? 'Nothing selected yet.'
          : `${chosen.length} selected: ${totalLabel}, about ${totalMinutes} minutes.`}
      </p>
      <p className="exq-book__inline-action">
        <Button disabled={chosen.length === 0} onClick={onContinue}>
          Continue
        </Button>
      </p>
      <StickyCTA
        primary={chosen.length === 0 ? 'Pick a service' : totalLabel}
        secondary={
          chosen.length === 0 ? undefined : `${totalMinutes} min, ${chosen.length} selected`
        }
      >
        <Button disabled={chosen.length === 0} onClick={onContinue}>
          Continue
        </Button>
      </StickyCTA>
    </div>
  );
}
