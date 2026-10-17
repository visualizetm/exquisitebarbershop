import type { WeekHours } from '@shared/schemas/common';
import { DAY_KEYS, type DayKey } from '@shared/lib/time';

const DAY_LABEL: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** Edits a week of opening intervals. An empty day means closed or not working. */
export function WeekHoursEditor({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: WeekHours;
  onChange: (next: WeekHours) => void;
}) {
  function setDay(day: DayKey, intervals: WeekHours[DayKey]) {
    onChange({ ...value, [day]: intervals });
  }

  return (
    <div className="exq-adm-week">
      {DAY_KEYS.map((day) => {
        const intervals = value[day];
        return (
          <fieldset
            key={day}
            className="exq-adm-week__day"
            data-state={intervals.length > 0 ? 'open' : 'closed'}
          >
            <legend>{DAY_LABEL[day]}</legend>
            {intervals.length === 0 ? <span className="exq-adm-week__closed">Closed</span> : null}
            {intervals.map((interval, index) => (
              <p key={`${day}-${String(index)}`} className="exq-adm-week__interval">
                <label htmlFor={`${idPrefix}-${day}-${String(index)}-start`}>From</label>{' '}
                <input
                  id={`${idPrefix}-${day}-${String(index)}-start`}
                  type="time"
                  step={900}
                  value={interval.start}
                  onChange={(e) => {
                    setDay(
                      day,
                      intervals.map((iv, i) =>
                        i === index ? { ...iv, start: e.target.value } : iv,
                      ),
                    );
                  }}
                />{' '}
                <label htmlFor={`${idPrefix}-${day}-${String(index)}-end`}>to</label>{' '}
                <input
                  id={`${idPrefix}-${day}-${String(index)}-end`}
                  type="time"
                  step={900}
                  value={interval.end}
                  onChange={(e) => {
                    setDay(
                      day,
                      intervals.map((iv, i) => (i === index ? { ...iv, end: e.target.value } : iv)),
                    );
                  }}
                />{' '}
                <button
                  type="button"
                  onClick={() => {
                    setDay(
                      day,
                      intervals.filter((_, i) => i !== index),
                    );
                  }}
                >
                  Remove
                </button>
              </p>
            ))}
            <button
              type="button"
              className="exq-adm-week__add"
              onClick={() => {
                setDay(day, [...intervals, { start: '09:00', end: '17:00' }]);
              }}
            >
              Add hours
            </button>
          </fieldset>
        );
      })}
    </div>
  );
}
