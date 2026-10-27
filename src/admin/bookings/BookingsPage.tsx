import { useSearchParams } from 'react-router';
import {
  BOOKING_TABLE_PAGE_SIZE,
  bookingRangeSchema,
  bookingSortKeySchema,
  bookingTableResponseSchema,
  staffListResponseSchema,
  type AdminBookingView,
  type BookingRange,
  type ActivityKind,
  type BookingSortKey,
  overviewResponseSchema,
} from '@shared/api/admin';
import { bookingStatusSchema } from '@shared/schemas/booking';
import {
  BarChart,
  Button,
  Chip,
  Chips,
  DataTable,
  EmptyState,
  ErrorState,
  Select,
  StatusChip,
  type Column,
} from '@/components/ui';
import { useApi } from '@/lib/useApi';
import { usePageTitle } from '@/lib/usePageTitle';
import { SOURCE_LABEL, phoneLabel, shopDateTime, shopWhen, STATUS_LABEL } from '../format';
import { useQuick } from '../shell/quick';

const KIND_WORDS: Record<ActivityKind, string> = {
  booked: 'Booked online',
  walkIn: 'Walk-in',
  canceled: 'Cancelled',
  rescheduled: 'Rescheduled',
  noShow: 'No show',
};

const RANGES: { key: Exclude<BookingRange, 'all'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
];

/**
 * Every booking in a real table, 25 to a page, sorted by the server. The quick filters carry
 * counts; a barber and a status narrow everything, counts included. The whole state lives in the
 * address, so a filtered list can be bookmarked and the back button works. A row opens the booking
 * side panel (the shell owns it), and /admin/bookings/:id opens the same panel over this list.
 */
export function BookingsPage() {
  usePageTitle('Bookings');
  const quick = useQuick();
  // The week against last week and the latest events live under the list (moved off Today in 13c).
  const overview = useApi('/api/admin/overview', overviewResponseSchema, {
    version: quick.version,
  });
  const ov = overview.status === 'ready' ? overview.data : null;
  const [params, setParams] = useSearchParams();
  const range = bookingRangeSchema.catch('upcoming').parse(params.get('range') ?? 'upcoming');
  const sort = bookingSortKeySchema.catch('when').parse(params.get('sort') ?? 'when');
  const dir = params.get('dir') === 'desc' ? 'desc' : params.get('dir') === 'asc' ? 'asc' : null;
  const staffId = params.get('staff') ?? '';
  const status = bookingStatusSchema.safeParse(params.get('status')).data ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const query = new URLSearchParams({ range, sort, page: String(page) });
  if (dir) query.set('dir', dir);
  if (staffId) query.set('staffId', staffId);
  if (status) query.set('status', status);
  const list = useApi(`/api/admin/booking-table?${query.toString()}`, bookingTableResponseSchema, {
    version: quick.version,
  });
  const staff = useApi('/api/admin/staff', staffListResponseSchema);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: false });
  }

  const effectiveDir = dir ?? (range === 'past' ? 'desc' : 'asc');
  function onSort(key: string) {
    const k = bookingSortKeySchema.parse(key);
    update({
      sort: k,
      dir: k === sort ? (effectiveDir === 'asc' ? 'desc' : 'asc') : 'asc',
      page: null,
    });
  }

  const columns: Column<AdminBookingView>[] = [
    {
      key: 'when',
      header: 'Date and time',
      sortable: true,
      primary: true,
      render: (b) => (
        <>
          {shopDateTime(b.startAt)}
          {b.isNew ? (
            <span className="exq-status-chip exq-table__new" data-tone="accent">
              New
            </span>
          ) : null}
        </>
      ),
    },
    { key: 'client', header: 'Client', sortable: true, render: (b) => b.customer.name },
    { key: 'phone', header: 'Phone', wide: true, render: (b) => phoneLabel(b.customer.phone) },
    {
      key: 'service',
      header: 'Service',
      wide: true,
      render: (b) => b.services.map((s) => s.name).join(', '),
    },
    { key: 'barber', header: 'Barber', wide: true, render: (b) => b.staff.name },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (b) => <StatusChip status={b.status} />,
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      wide: true,
      render: (b) => SOURCE_LABEL[b.source] ?? b.source,
    },
  ];

  const data = list.status === 'ready' ? list.data : null;
  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * BOOKING_TABLE_PAGE_SIZE + 1;
  const last = Math.min(total, page * BOOKING_TABLE_PAGE_SIZE);
  const sortKey: BookingSortKey = sort;

  return (
    <div className="exq-bookings" data-state={list.status}>
      <div className="exq-dash-head">
        <h1>Bookings</h1>
        <Button
          size="sm"
          onClick={() => {
            quick.openNewBooking();
          }}
        >
          New booking
        </Button>
      </div>

      <div className="exq-filters">
        <Chips label="Show" scroll>
          {RANGES.map((r) => (
            <Chip
              key={r.key}
              selected={range === r.key}
              count={data?.counts[r.key]}
              onClick={() => {
                update({ range: r.key === 'upcoming' ? null : r.key, page: null });
              }}
            >
              {r.label}
            </Chip>
          ))}
        </Chips>
        <div className="exq-filters__selects">
          <Select
            label="Barber"
            value={staffId}
            onChange={(e) => {
              update({ staff: e.target.value, page: null });
            }}
          >
            <option value="">All barbers</option>
            {staff.status === 'ready'
              ? staff.data.staff
                  .filter((s) => !s.deletedAt)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
              : null}
          </Select>
          <Select
            label="Status"
            value={status}
            onChange={(e) => {
              update({ status: e.target.value, page: null });
            }}
          >
            <option value="">Any status</option>
            {bookingStatusSchema.options.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <section className="exq-panel" data-flush="true" aria-label="Bookings list">
        <DataTable
          caption="Bookings"
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(b) => b.id}
          state={list.status}
          sort={{ key: sortKey, dir: effectiveDir }}
          onSort={onSort}
          onOpen={(b) => {
            quick.openBooking(b.id);
          }}
          openLabel={(b) => `Open booking for ${b.customer.name}, ${shopDateTime(b.startAt)}`}
          onRetry={() => {
            quick.changed();
          }}
          empty={
            <EmptyState
              title="No bookings here"
              action={
                range !== 'upcoming' || staffId || status ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setParams(new URLSearchParams());
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            >
              {range === 'past' ? 'Nothing has happened yet.' : 'Nothing matches these filters.'}
            </EmptyState>
          }
          footer={
            data && total > 0 ? (
              <>
                <span aria-live="polite">
                  {first} to {last} of {total}
                </span>
                <span className="exq-pager">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => {
                      update({ page: page <= 2 ? null : String(page - 1) });
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={last >= total}
                    onClick={() => {
                      update({ page: String(page + 1) });
                    }}
                  >
                    Next
                  </Button>
                </span>
              </>
            ) : null
          }
        />
      </section>

      <div className="exq-dash-grid" data-cols="split">
        <section className="exq-panel" aria-labelledby="exq-recent">
          <div className="exq-panel__head">
            <h2 id="exq-recent">Recent activity</h2>
          </div>
          {overview.status === 'loading' ? (
            <p className="exq-skeleton exq-activity__placeholder" aria-busy="true">
              Loading recent activity
            </p>
          ) : ov?.activity.length === 0 ? (
            <EmptyState title="Nothing yet">
              Bookings, cancellations and walk-ins will show here as they happen.
            </EmptyState>
          ) : ov ? (
            <ul className="exq-activity exq-bare">
              {ov.activity.map((event) => (
                <li key={event.id} className="exq-activity__item">
                  <button
                    type="button"
                    className="exq-activity__btn"
                    onClick={() => {
                      quick.openBooking(event.bookingId);
                    }}
                  >
                    <span className="exq-activity__time">{shopWhen(event.at, ov.date)}</span>
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
          ) : (
            <ErrorState title="Recent activity did not load">Reload the page.</ErrorState>
          )}
        </section>
        <section className="exq-panel">
          {ov ? (
            <BarChart
              title="Bookings this week"
              nameA="This week"
              nameB="Last week"
              groups={ov.week.map((d) => ({
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
    </div>
  );
}
