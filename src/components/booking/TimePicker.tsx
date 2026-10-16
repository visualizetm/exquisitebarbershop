import { availabilityResponseSchema, type AvailabilitySlot } from '@shared/api/availability';
import { Status } from '@/components/Status';
import { slotLabel } from '@/lib/booking/state';
import { useApi } from '@/lib/useApi';

export interface TimePickerProps {
  date: string;
  serviceIds: string[];
  staff: string;
  selected: string | null;
  version?: number;
  onPick: (slot: AvailabilitySlot) => void;
}

export function TimePicker({
  date,
  serviceIds,
  staff,
  selected,
  version,
  onPick,
}: TimePickerProps) {
  const query = new URLSearchParams({ date, serviceIds: serviceIds.join(','), staff });
  const result = useApi(
    `/api/availability?${query.toString()}`,
    availabilityResponseSchema,
    version === undefined ? {} : { version },
  );
  if (result.status === 'loading') return <Status state="loading" message="Finding open times" />;
  if (result.status === 'error') return <Status state="error" />;
  const { slots, closedReason } = result.data;
  return (
    <div className="exq-time-picker" data-state={slots.length === 0 ? 'none' : 'ready'}>
      {slots.length === 0 ? (
        <p className="exq-time-picker__empty" role="alert">
          {closedReason ?? 'No open times that day.'} Try another day.
        </p>
      ) : (
        <ul className="exq-time-picker__list">
          {slots.map((slot) => (
            <li
              key={slot.startAt}
              className="exq-time-option"
              data-state={selected === slot.startAt ? 'selected' : 'available'}
            >
              <button
                type="button"
                className="exq-time-option__button"
                aria-pressed={selected === slot.startAt}
                data-start={slot.startAt}
                onClick={() => {
                  onPick(slot);
                }}
              >
                {slotLabel(slot)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
