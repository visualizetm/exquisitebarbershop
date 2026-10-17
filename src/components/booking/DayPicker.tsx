import {
  availabilityDaysResponseSchema,
  type NoAvailabilityReason,
} from '@shared/api/availability';
import { Status } from '@/components/Status';
import { useApi } from '@/lib/useApi';

const REASON_LABEL: Record<NoAvailabilityReason, string> = {
  closed: 'Closed',
  dayOff: 'Not working',
  fullyBooked: 'Fully booked',
  outsideWindow: 'Not open for booking',
  noQualifiedStaff: 'Not offered',
};

export interface DayPickerProps {
  serviceIds: string[];
  staff: string;
  selected: string | null;
  version?: number;
  onPick: (date: string) => void;
}

function dayParts(date: string): { weekday: string; day: string } {
  const d = new Date(`${date}T12:00:00`);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

/** Days as a sideways strip of chips, each with how many times are open. Empty days say why. */
export function DayPicker({ serviceIds, staff, selected, version, onPick }: DayPickerProps) {
  const query = new URLSearchParams({ serviceIds: serviceIds.join(','), staff });
  const result = useApi(
    `/api/availability/days?${query.toString()}`,
    availabilityDaysResponseSchema,
    version === undefined ? {} : { version },
  );
  if (result.status === 'loading')
    return <Status state="loading" message="Checking the calendar" />;
  if (result.status === 'error') return <Status state="error" />;
  const { days } = result.data;
  const anyAvailable = days.some((d) => d.available);
  return (
    <div className="exq-day-picker" data-state={anyAvailable ? 'ready' : 'none'}>
      {!anyAvailable ? (
        <p className="exq-day-picker__empty" role="alert">
          Nothing is open in the next {days.length} days. Please call the shop.
        </p>
      ) : null}
      <ul className="exq-day-picker__list exq-chips" data-scroll="true">
        {days.map((day) => {
          const state = day.available
            ? selected === day.date
              ? 'selected'
              : 'available'
            : 'unavailable';
          const parts = dayParts(day.date);
          const reason = !day.available && day.reason ? REASON_LABEL[day.reason] : null;
          return (
            <li key={day.date} className="exq-day-option" data-state={state}>
              <button
                type="button"
                className="exq-day-option__button"
                disabled={!day.available}
                aria-pressed={selected === day.date}
                aria-label={`${parts.weekday} ${parts.day}, ${
                  day.available ? `${String(day.count ?? 0)} open times` : (reason ?? 'unavailable')
                }`}
                onClick={() => {
                  onPick(day.date);
                }}
              >
                <span className="exq-day-option__weekday">{parts.weekday}</span>
                <span className="exq-day-option__date">{parts.day}</span>
                <span className="exq-day-option__count">
                  {day.available ? `${String(day.count ?? 0)} open` : null}
                </span>
                {reason ? <span className="exq-day-option__reason">{reason}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
