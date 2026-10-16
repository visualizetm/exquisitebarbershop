import type { PublicStaff } from '@shared/api/public';
import { qualifiedStaff } from '@/lib/booking/helpers';

export interface StaffPickerProps {
  staff: PublicStaff[];
  serviceIds: string[];
  selected: string | null;
  allowFirstAvailable: boolean;
  onChange: (selector: string) => void;
  onContinue: () => void;
}

export function StaffPicker({
  staff,
  serviceIds,
  selected,
  allowFirstAvailable,
  onChange,
  onContinue,
}: StaffPickerProps) {
  const qualified = qualifiedStaff(staff, serviceIds);
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
          <legend className="exq-staff-picker__legend">Who would you like?</legend>
          <ul className="exq-staff-picker__list">
            {allowFirstAvailable ? (
              <li
                className="exq-staff-option"
                data-state={selected === 'any' ? 'selected' : 'idle'}
              >
                <label className="exq-staff-option__label">
                  <input
                    type="radio"
                    name="staff"
                    value="any"
                    checked={selected === 'any'}
                    onChange={() => {
                      onChange('any');
                    }}
                  />
                  <span className="exq-staff-option__name">First available</span>
                  <span className="exq-staff-option__meta">We will pick a chair for you</span>
                </label>
              </li>
            ) : null}
            {qualified.map((member) => (
              <li
                key={member.id}
                className="exq-staff-option"
                data-state={selected === member.slug ? 'selected' : 'idle'}
              >
                <label className="exq-staff-option__label">
                  <input
                    type="radio"
                    name="staff"
                    value={member.slug}
                    checked={selected === member.slug}
                    onChange={() => {
                      onChange(member.slug);
                    }}
                  />
                  <span className="exq-staff-option__name">{member.name}</span>
                  <span className="exq-staff-option__meta">
                    {member.title}
                    {member.chairNumber !== null ? `, chair ${member.chairNumber}` : ''}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <button
        type="button"
        className="exq-button exq-button--primary"
        disabled={!selected || qualified.length === 0}
        onClick={onContinue}
      >
        Continue
      </button>
    </div>
  );
}
