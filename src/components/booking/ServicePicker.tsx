import type { PublicService } from '@shared/api/public';
import { formatCents, priceLabel } from '@shared/lib/money';
import { Button, OptionCard } from '@/components/ui';

export interface ServicePickerProps {
  services: PublicService[];
  /** Set when the list is one chair's menu, so the picker says why some services are missing. */
  chairName?: string | undefined;
  /** Drops the chair choice so every service is listed (shown beside the chair's name). */
  onShowAll?: (() => void) | undefined;
  /**
   * What the chosen services come to for the person or the first available pool the page is
   * pricing for. Without it the picker adds up the rows it shows.
   */
  totals?: { cents: number; minutes: number; from: boolean } | undefined;
  selected: string[];
  max: number;
  onChange: (selected: string[]) => void;
  onContinue: () => void;
}

/** Services as option cards with price and duration. On phones the bottom bar carries the total and Continue. */
export function ServicePicker({
  services,
  chairName,
  onShowAll,
  totals,
  selected,
  max,
  onChange,
  onContinue,
}: ServicePickerProps) {
  const chosen = services.filter((s) => selected.includes(s.id));
  const totalCents = totals?.cents ?? chosen.reduce((sum, s) => sum + s.priceCents, 0);
  const totalMinutes = totals?.minutes ?? chosen.reduce((sum, s) => sum + s.durationMinutes, 0);
  const anyFrom = totals?.from ?? chosen.some((s) => s.priceFrom);
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
      {chairName ? (
        <div className="exq-service-picker__chair">
          <p className="exq-muted">Showing what {chairName} offers.</p>
          {onShowAll ? (
            <Button variant="ghost" onClick={onShowAll}>
              See every service
            </Button>
          ) : null}
        </div>
      ) : null}
      {groups.map((group) => {
        const items = services.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <fieldset key={group} className="exq-service-picker__group">
            <legend className="exq-service-picker__legend exq-label">{group}</legend>
            <ul className="exq-service-picker__list exq-bare">
              {items.map((service) => {
                const checked = selected.includes(service.id);
                const disabled = !checked && full;
                return (
                  <li
                    key={service.id}
                    className="exq-service-option"
                    data-state={checked ? 'selected' : disabled ? 'disabled' : 'idle'}
                  >
                    <OptionCard
                      kind="checkbox"
                      selected={checked}
                      disabled={disabled}
                      title={service.name}
                      description={service.description || undefined}
                      meta={
                        <>
                          <span className="exq-service-option__price exq-price">
                            {priceLabel(service)}
                          </span>
                          <span className="exq-service-option__duration">
                            {service.durationMinutes} min
                          </span>
                        </>
                      }
                      onChange={() => {
                        toggle(service.id);
                      }}
                    />
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
    </div>
  );
}
