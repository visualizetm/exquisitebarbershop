import { useSearchParams } from 'react-router';
import ChevronLeft from '@untitled-ui/icons-react/build/esm/ChevronLeft';
import ChevronRight from '@untitled-ui/icons-react/build/esm/ChevronRight';
import { scheduleResponseSchema, scheduleWeekResponseSchema } from '@shared/api/admin';
import { Button, Chip, Chips, ErrorState, IconButton, Input } from '@/components/ui';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { addDays, shopDateLabel, todayInShop } from '../format';
import { useQuick } from '../shell/quick';
import { DayGrid } from './DayGrid';
import { WeekGrid } from './WeekGrid';

/** Day and week views of every chair. The view and the date live in the address. */
export function SchedulePage() {
  usePageTitle('Schedule');
  const quick = useQuick();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'week' ? 'week' : 'day';
  const date = params.get('date') ?? todayInShop();
  const day = useApi(
    view === 'day' ? `/api/admin/schedule?date=${date}` : null,
    scheduleResponseSchema,
    { version: quick.version },
  );
  const week = useApi(
    view === 'week' ? `/api/admin/schedule/week?date=${date}` : null,
    scheduleWeekResponseSchema,
    { version: quick.version },
  );
  const state = view === 'day' ? day : week;

  function go(next: { view?: 'day' | 'week'; date?: string }) {
    setParams({ view: next.view ?? view, date: next.date ?? date }, { replace: true });
  }
  const step = view === 'day' ? 1 : 7;

  return (
    <div className="exq-schedule" data-state={state.status} data-view={view}>
      <div className="exq-dash-head">
        <div>
          <h1>Schedule</h1>
          <p className="exq-dash-head__sub">
            {view === 'day'
              ? shopDateLabel(date)
              : `Week of ${shopDateLabel(week.status === 'ready' ? (week.data.days[0]?.date ?? date) : date)}`}
          </p>
        </div>
        <div className="exq-schedule__controls">
          <Chips label="View">
            <Chip
              selected={view === 'day'}
              onClick={() => {
                go({ view: 'day' });
              }}
            >
              Day
            </Chip>
            <Chip
              selected={view === 'week'}
              onClick={() => {
                go({ view: 'week' });
              }}
            >
              Week
            </Chip>
          </Chips>
          <IconButton
            label={view === 'day' ? 'Previous day' : 'Previous week'}
            icon={<ChevronLeft aria-hidden="true" />}
            onClick={() => {
              go({ date: addDays(date, -step) });
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              go({ date: todayInShop() });
            }}
          >
            Today
          </Button>
          <IconButton
            label={view === 'day' ? 'Next day' : 'Next week'}
            icon={<ChevronRight aria-hidden="true" />}
            onClick={() => {
              go({ date: addDays(date, step) });
            }}
          />
          <Input
            label="Go to day"
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) go({ date: e.target.value });
            }}
          />
        </div>
      </div>

      <section
        className="exq-panel"
        data-flush="true"
        aria-label={view === 'day' ? 'Day schedule' : 'Week schedule'}
      >
        {state.status === 'error' ? (
          <ErrorState title="The schedule did not load">
            Check the connection and try again.
          </ErrorState>
        ) : state.status === 'loading' ? (
          <div className="exq-skeleton exq-schedule__placeholder" aria-busy="true" role="status">
            Loading the schedule
          </div>
        ) : view === 'day' && day.status === 'ready' ? (
          <DayGrid
            schedule={day.data}
            onSlot={(staffId, startAt) => {
              quick.openNewBooking({ staffId, startAt });
            }}
            onBooking={quick.openBooking}
          />
        ) : week.status === 'ready' ? (
          <WeekGrid
            week={week.data}
            onDay={(d) => {
              go({ view: 'day', date: d });
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
