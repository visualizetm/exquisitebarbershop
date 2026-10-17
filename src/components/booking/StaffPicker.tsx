import type { PublicStaff } from '@shared/api/public';
import { Button, ChairCard } from '@/components/ui';
import { qualifiedStaff } from '@/lib/booking/helpers';
import { inChairOrder } from '@/lib/chairStatus';

export interface StaffPickerProps {
  staff: PublicStaff[];
  serviceIds: string[];
  selected: string | null;
  allowFirstAvailable: boolean;
  onChange: (selector: string) => void;
  onContinue: () => void;
}

/** Chairs as cards plus a "first available" card. Only chairs that do every chosen service appear. */
export function StaffPicker({
  staff,
  serviceIds,
  selected,
  allowFirstAvailable,
  onChange,
  onContinue,
}: StaffPickerProps) {
  const qualified = inChairOrder(qualifiedStaff(staff, serviceIds));
  return (
    <div
      className="exq-staff-picker"
      data-state={qualified.length === 0 ? 'none' : selected ? 'selected' : 'idle'}
    >
      {qualified.length === 0 ? (
        <p className="exq-staff-picker__empty" role="alert">
          No one offers that combination of services online. Try fewer services or call the shop.
        </p>
      ) : (
        <fieldset className="exq-staff-picker__group">
          <legend className="exq-staff-picker__legend exq-label">Who would you like?</legend>
          <ul className="exq-staff-picker__list exq-grid" data-cols="2" data-lg="4">
            {allowFirstAvailable ? (
              <li
                className="exq-staff-option exq-staff-option--any"
                data-state={selected === 'any' ? 'selected' : 'idle'}
              >
                <button
                  type="button"
                  className="exq-chaircard exq-staff-option__any"
                  data-state={selected === 'any' ? 'selected' : 'none'}
                  aria-pressed={selected === 'any'}
                  onClick={() => {
                    onChange('any');
                  }}
                >
                  <span className="exq-arch exq-staff-option__any-mark" data-state="placeholder">
                    <span className="exq-arch__placeholder" aria-hidden="true">
                      Any
                    </span>
                  </span>
                  <span className="exq-chaircard__body">
                    <span className="exq-chaircard__name exq-h">First available</span>
                    <span className="exq-chaircard__specialty">We pick the least booked chair</span>
                  </span>
                </button>
              </li>
            ) : null}
            {qualified.map((member) => (
              <li
                key={member.id}
                className="exq-staff-option"
                data-state={selected === member.slug ? 'selected' : 'idle'}
              >
                <ChairCard
                  name={member.name}
                  specialty={member.specialty || member.title}
                  chairNumber={member.chairNumber}
                  photo={member.photo ?? null}
                  selected={selected === member.slug}
                  onSelect={() => {
                    onChange(member.slug);
                  }}
                />
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <p className="exq-book__inline-action">
        <Button disabled={!selected || qualified.length === 0} onClick={onContinue}>
          Continue
        </Button>
      </p>
    </div>
  );
}
