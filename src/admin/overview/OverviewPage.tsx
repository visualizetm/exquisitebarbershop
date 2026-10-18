import AlertTriangle from '@untitled-ui/icons-react/build/esm/AlertTriangle';
import Announcement01 from '@untitled-ui/icons-react/build/esm/Announcement01';
import CalendarCheck01 from '@untitled-ui/icons-react/build/esm/CalendarCheck01';
import CoinsHand from '@untitled-ui/icons-react/build/esm/CoinsHand';
import Plus from '@untitled-ui/icons-react/build/esm/Plus';
import SlashCircle01 from '@untitled-ui/icons-react/build/esm/SlashCircle01';
import UserPlus01 from '@untitled-ui/icons-react/build/esm/UserPlus01';
import UserX01 from '@untitled-ui/icons-react/build/esm/UserX01';
import {
  overviewResponseSchema,
  type ActivityKind,
  type AdminBookingView,
  type OverviewResponse,
} from '@shared/api/admin';
import { BarChart, Button, EmptyState, ErrorState, StatTile, StatusChip } from '@/components/ui';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { Avatar } from '../components/Avatar';
import { firstNameLastInitial, money, shopDateLabel, shopTime, shopWhen } from '../format';
import { useQuick } from '../shell/quick';

const KIND_WORDS: Record<ActivityKind, string> = {
  booked: 'Booked online',
  walkIn: 'Walk-in',
  canceled: 'Cancelled',
  rescheduled: 'Rescheduled',
  noShow: 'No show',
};

/**
 * The first screen: anything that needs a decision, the quick actions, four numbers computed from
 * real bookings, who is in each chair now and next, the week against last week, and the latest
 * events. Every number comes from the server; a compare line shows only when last week has data.
 */
export function OverviewPage() {
  usePageTitle('Overview');
  const quick = useQuick();
  const state = useApi('/api/admin/overview', overviewResponseSchema, { version: quick.version });
  const loading = state.status === 'loading';
  const data = state.status === 'ready' ? state.data : null;

  return (
    <div className="exq-overview" data-state={state.status}>
      <div className="exq-dash-head">
        <div>
          <h1>Overview</h1>
          <p className="exq-dash-head__sub">{data ? shopDateLabel(data.date) : ' '}</p>
        </div>
      </div>

      {data && data.alerts.length > 0 ? (
        <div className="exq-alerts" role="region" aria-label="Needs a decision">
          {data.alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              className="exq-alert"
              data-kind={alert.kind}
              onClick={() => {
                quick.openAlert(alert.id);
              }}
            >
              <AlertTriangle aria-hidden="true" />
              <span className="exq-alert__text">
                {alert.kind === 'barberOut'
                  ? `${alert.staffName} is out ${alert.fromDate === data.date ? 'today' : shopDateLabel(alert.fromDate)}.`
                  : `${alert.staffName} asked for ${shopDateLabel(alert.fromDate)}${alert.toDate !== alert.fromDate ? ` to ${shopDateLabel(alert.toDate)}` : ''} off.`}{' '}
                {alert.affectedCount}{' '}
                {alert.affectedCount === 1 ? 'booking needs' : 'bookings need'} a decision.
              </span>
              <span className="exq-alert__go">Decide</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="exq-quick" role="group" aria-label="Quick actions">
        <Button
          size="sm"
          icon={<Plus aria-hidden="true" />}
          onClick={() => {
            quick.openNewBooking();
          }}
        >
          New booking
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<UserPlus01 aria-hidden="true" />}
          onClick={() => {
            quick.openNewBooking({ source: 'walkIn' });
          }}
        >
          Walk-in
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<SlashCircle01 aria-hidden="true" />}
          onClick={() => {
            quick.openBlock();
          }}
        >
          Block time
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<UserX01 aria-hidden="true" />}
          onClick={() => {
            quick.openBarberOut();
          }}
        >
          Barber out today
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<Announcement01 aria-hidden="true" />}
          onClick={() => {
            quick.openAnnouncement();
          }}
        >
          Edit announcement
        </Button>
      </div>

      {state.status === 'error' ? (
        <ErrorState title="The overview did not load">
          Check the connection and reload the page.
        </ErrorState>
      ) : (
        <>
          <div className="exq-dash-grid" data-cols="4">
            <StatTile
              icon={<CalendarCheck01 aria-hidden="true" />}
              label="Bookings today"
              loading={loading}
              value={data?.stats.bookings.value ?? 0}
              compare={compareLine(data, data?.stats.bookings.compare, (n) => String(n))}
            />
            <StatTile
              icon={<CoinsHand aria-hidden="true" />}
              label="Booked value today"
              loading={loading}
              value={money(data?.stats.bookedValueCents.value ?? 0)}
              compare={compareLine(data, data?.stats.bookedValueCents.compare, money)}
            />
            <StatTile
              icon={<UserPlus01 aria-hidden="true" />}
              label="Walk-ins today"
              loading={loading}
              value={data?.stats.walkIns.value ?? 0}
              compare={compareLine(data, data?.stats.walkIns.compare, (n) => String(n))}
            />
            <StatTile
              icon={<UserX01 aria-hidden="true" />}
              label="No-shows this week"
              loading={loading}
              value={data?.stats.noShowsWeek.value ?? 0}
              compare={
                data && data.stats.noShowsWeek.compare !== null
                  ? `vs last week: ${data.stats.noShowsWeek.compare}`
                  : undefined
              }
            />
          </div>

          <div className="exq-dash-grid" data-cols="split">
            <section className="exq-panel" aria-labelledby="exq-now-next">
              <div className="exq-panel__head">
                <h2 id="exq-now-next">Now and next</h2>
              </div>
              {loading ? (
                <ul className="exq-chairs exq-bare" aria-busy="true">
                  {Array.from({ length: 6 }, (_, i) => (
                    <li key={i} className="exq-chairrow">
                      <span className="exq-skeleton exq-chairrow__avatar" />
                      <span className="exq-skeleton">Loading the chair</span>
                    </li>
                  ))}
                </ul>
              ) : data ? (
                <ul className="exq-chairs exq-bare">
                  {data.chairs.map((chair) => (
                    <ChairRow key={chair.staff.id} chair={chair} onOpen={quick.openBooking} />
                  ))}
                </ul>
              ) : null}
            </section>
            <section className="exq-panel">
              {data ? (
                <BarChart
                  title="Bookings this week"
                  nameA="This week"
                  nameB="Last week"
                  groups={data.week.map((d) => ({
                    label: d.label,
                    a: d.thisWeek,
                    b: d.lastWeek,
                    current: d.today,
                  }))}
                />
              ) : (
                <div className="exq-skeleton exq-chart__placeholder" aria-busy="true">
                  Loading the chart
                </div>
              )}
            </section>
          </div>

          <section className="exq-panel" aria-labelledby="exq-recent">
            <div className="exq-panel__head">
              <h2 id="exq-recent">Recent activity</h2>
            </div>
            {loading ? (
              <p className="exq-skeleton exq-activity__placeholder" aria-busy="true">
                Loading recent activity
              </p>
            ) : data?.activity.length === 0 ? (
              <EmptyState title="Nothing yet">
                Bookings, cancellations and walk-ins will show here as they happen.
              </EmptyState>
            ) : data ? (
              <ul className="exq-activity exq-bare">
                {data.activity.map((event) => (
                  <li key={event.id} className="exq-activity__item">
                    <button
                      type="button"
                      className="exq-activity__btn"
                      onClick={() => {
                        quick.openBooking(event.bookingId);
                      }}
                    >
                      <span className="exq-activity__time">{shopWhen(event.at, data.date)}</span>
                      <span className="exq-activity__who">
                        {event.clientName}
                        <span className="exq-activity__sub">
                          {KIND_WORDS[event.kind]}, with {event.staffName}
                        </span>
                      </span>
                      <StatusChip status={event.status} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function compareLine(
  data: OverviewResponse | null,
  value: number | null | undefined,
  format: (n: number) => string,
): string | undefined {
  if (!data || value === null || value === undefined) return undefined;
  return `vs last ${data.weekdayName}: ${format(value)}`;
}

function ChairRow({
  chair,
  onOpen,
}: {
  chair: OverviewResponse['chairs'][number];
  onOpen: (id: string) => void;
}) {
  const line = (label: string, b: AdminBookingView | null) =>
    b ? (
      <button
        type="button"
        className="exq-chairrow__btn"
        onClick={() => {
          onOpen(b.id);
        }}
        aria-label={`${label}: ${shopTime(b.startAt)}, ${b.customer.name}`}
      >
        <b>{label}</b> {shopTime(b.startAt)} {firstNameLastInitial(b.customer.name)}
      </button>
    ) : (
      <span>
        <b>{label}</b>{' '}
        {label === 'Now' ? (chair.status === 'in' ? 'Free' : 'No one') : 'Nobody else'}
      </span>
    );
  return (
    <li className="exq-chairrow" data-state={chair.status}>
      <Avatar name={chair.staff.name} photo={chair.photo} />
      <div className="exq-chairrow__body">
        <span className="exq-chairrow__top">
          {chair.staff.name}
          <span className="exq-status-chip" data-tone={chair.status === 'in' ? 'ok' : 'muted'}>
            {chair.status === 'in' ? 'In' : chair.status === 'closed' ? 'Closed' : 'Off today'}
          </span>
        </span>
        <p className="exq-chairrow__lines">
          {line('Now', chair.current)}
          {line('Next', chair.next)}
        </p>
      </div>
    </li>
  );
}
