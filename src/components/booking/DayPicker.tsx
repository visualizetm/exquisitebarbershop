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

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

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
      <ul className="exq-day-picker__list">
        {days.map((day) => (
          <li
            key={day.date}
            className="exq-day-option"
            data-state={
              day.available ? (selected === day.date ? 'selected' : 'available') : 'unavailable'
            }
          >
            <button
              type="button"
              className="exq-day-option__button"
              disabled={!day.available}
              aria-pressed={selected === day.date}
              onClick={() => {
                onPick(day.date);
              }}
            >
              <span className="exq-day-option__date">{dayLabel(day.date)}</span>
              {!day.available && day.reason ? (
                <span className="exq-day-option__reason">{REASON_LABEL[day.reason]}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
