import type { ScheduleWeekResponse } from '@shared/api/admin';
import { shopDateLabel } from '../format';

/**
 * The week: chairs as rows, days as columns, the number of bookings in each cell. A real table.
 * A cell opens that day for that chair's view; off and closed days say so instead of showing zero.
 */
export function WeekGrid({
  week,
  onDay,
}: {
  week: ScheduleWeekResponse;
  onDay: (date: string) => void;
}) {
  return (
    <div className="exq-table-wrap">
      <table className="exq-table exq-weekgrid">
        <caption className="exq-visually-hidden">Bookings per chair and day this week</caption>
        <thead>
          <tr>
            <th scope="col">Barber</th>
            {week.days.map((d) => (
              <th key={d.date} scope="col" data-align="end" data-today={d.today ? 'true' : 'false'}>
                {d.label}
                <span className="exq-weekgrid__date">{shopDateLabel(d.date).split(', ')[1]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.rows.map((row) => (
            <tr key={row.staff.id}>
              <th scope="row">{row.staff.name}</th>
              {row.cells.map((cell) => (
                <td key={cell.date} data-align="end">
                  <button
                    type="button"
                    className="exq-weekgrid__cell"
                    data-status={cell.status}
                    data-empty={cell.count === 0 ? 'true' : 'false'}
                    aria-label={`${row.staff.name}, ${shopDateLabel(cell.date)}: ${
                      cell.status === 'working'
                        ? `${cell.count} ${cell.count === 1 ? 'booking' : 'bookings'}`
                        : cell.status === 'closed'
                          ? 'closed'
                          : 'off'
                    }`}
                    onClick={() => {
                      onDay(cell.date);
                    }}
                  >
                    {cell.status === 'working'
                      ? cell.count
                      : cell.status === 'closed'
                        ? 'Closed'
                        : 'Off'}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
