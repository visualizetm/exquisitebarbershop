import { DateTime } from 'luxon';
import { availabilityResponseSchema, type AvailabilitySlot } from '@shared/api/availability';
import { SHOP_TIMEZONE } from '@shared/lib/constants';
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

type Part = 'Morning' | 'Afternoon' | 'Evening';
const PARTS: Part[] = ['Morning', 'Afternoon', 'Evening'];

function partOf(slot: AvailabilitySlot): Part {
  const hour = DateTime.fromISO(slot.startAt, { zone: SHOP_TIMEZONE }).hour;
  return hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
}

/** Open times as chips, grouped into morning, afternoon and evening. */
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
        PARTS.map((part) => {
          const group = slots.filter((s) => partOf(s) === part);
          if (group.length === 0) return null;
          return (
            <section
              key={part}
              className="exq-time-picker__part"
              aria-labelledby={`exq-time-${part}`}
            >
              <h3 id={`exq-time-${part}`} className="exq-time-picker__part-title exq-label">
                {part}
              </h3>
              <ul className="exq-time-picker__list exq-chips">
                {group.map((slot) => (
                  <li
                    key={slot.startAt}
                    className="exq-time-option"
                    data-state={selected === slot.startAt ? 'selected' : 'available'}
                  >
                    <button
                      type="button"
                      className="exq-time-option__button exq-timechip"
                      data-state={selected === slot.startAt ? 'selected' : 'default'}
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
            </section>
          );
        })
      )}
    </div>
  );
}
