import type { PublicService } from '@shared/api/public';
import { formatCents, priceLabel } from '@shared/lib/money';

export interface ServicePickerProps {
  services: PublicService[];
  selected: string[];
  max: number;
  onChange: (selected: string[]) => void;
  onContinue: () => void;
}

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
            <legend className="exq-service-picker__legend">{group}</legend>
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
                      <span className="exq-service-option__name">{service.name}</span>
                      <span className="exq-service-option__meta">
                        {priceLabel(service)}, {service.durationMinutes} min
                      </span>
                    </label>
                    {service.description ? (
                      <p className="exq-service-option__description">{service.description}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
      <p className="exq-service-picker__hint">Choose up to {max} services.</p>
      <p className="exq-service-picker__total" aria-live="polite">
        {chosen.length === 0
          ? 'Nothing selected yet.'
          : `${chosen.length} selected: ${anyFrom ? 'from ' : ''}${formatCents(totalCents)}, about ${totalMinutes} minutes.`}
      </p>
      <button
        type="button"
        className="exq-button exq-button--primary"
        disabled={chosen.length === 0}
        onClick={onContinue}
      >
        Continue
      </button>
    </div>
  );
}
