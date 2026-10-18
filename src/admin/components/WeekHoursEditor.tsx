import XClose from '@untitled-ui/icons-react/build/esm/XClose';
import type { WeekHours } from '@shared/schemas/common';
import { DAY_KEYS, type DayKey } from '@shared/lib/time';
import { Button, IconButton, Input } from '@/components/ui';

const DAY_LABEL: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** Edits a week of opening intervals. A day with no hours is closed (or the person is not in). */
export function WeekHoursEditor({
  value,
  onChange,
}: {
  idPrefix?: string;
  value: WeekHours;
  onChange: (next: WeekHours) => void;
}) {
  function setDay(day: DayKey, intervals: WeekHours[DayKey]) {
    onChange({ ...value, [day]: intervals });
  }
  return (
    <div className="exq-week">
      {DAY_KEYS.map((day) => {
        const intervals = value[day];
        return (
          <fieldset
            key={day}
            className="exq-week__day"
            data-state={intervals.length > 0 ? 'open' : 'closed'}
          >
            <legend>{DAY_LABEL[day]}</legend>
            {intervals.length === 0 ? <p className="exq-week__closed">Closed</p> : null}
            {intervals.map((interval, index) => (
              <div key={`${day}-${String(index)}`} className="exq-week__interval">
                <Input
                  label={`${DAY_LABEL[day]} opens`}
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
                />
                <Input
                  label={`${DAY_LABEL[day]} closes`}
                  type="time"
                  step={900}
                  value={interval.end}
                  onChange={(e) => {
                    setDay(
                      day,
                      intervals.map((iv, i) => (i === index ? { ...iv, end: e.target.value } : iv)),
                    );
                  }}
                />
                <IconButton
                  label={`Remove ${DAY_LABEL[day]} hours`}
                  icon={<XClose aria-hidden="true" />}
                  onClick={() => {
                    setDay(
                      day,
                      intervals.filter((_, i) => i !== index),
                    );
                  }}
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDay(day, [...intervals, { start: '09:00', end: '17:00' }]);
              }}
            >
              {intervals.length === 0 ? 'Add hours' : 'Add a second block'}
            </Button>
          </fieldset>
        );
      })}
    </div>
  );
}
