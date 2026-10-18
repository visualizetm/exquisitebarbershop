import type { ReactNode } from 'react';
import ArrowDown from '@untitled-ui/icons-react/build/esm/ArrowDown';
import ArrowUp from '@untitled-ui/icons-react/build/esm/ArrowUp';
import { EmptyState, ErrorState } from './States';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Sortable columns render their header as a button. */
  sortable?: boolean;
  align?: 'start' | 'end';
  /** Hidden below 768px so the table fits a phone. */
  wide?: boolean;
  /** The cell holding the row's open button (the whole row becomes clickable through it). */
  primary?: boolean;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

/**
 * A real table. Server paged: the caller passes one page of rows and the pager. Sortable headers
 * are buttons that report the new sort (the server sorts). The primary cell holds a real button
 * that stretches over the row, so a row opens by pointer, Tab and Enter without a click handler
 * on the row itself.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  state,
  sort,
  onSort,
  onOpen,
  openLabel,
  empty,
  onRetry,
  footer,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  state: 'loading' | 'ready' | 'error';
  sort?: SortState | undefined;
  onSort?: ((key: string) => void) | undefined;
  onOpen?: ((row: T) => void) | undefined;
  openLabel?: ((row: T) => string) | undefined;
  empty: ReactNode;
  onRetry?: (() => void) | undefined;
  footer?: ReactNode;
}) {
  if (state === 'error') {
    return (
      <ErrorState
        title="That list did not load"
        action={
          onRetry ? (
            <button
              type="button"
              className="exq-btn"
              data-variant="outline"
              data-size="sm"
              onClick={onRetry}
            >
              <span className="exq-btn__label">Try again</span>
            </button>
          ) : undefined
        }
      >
        Check the connection and try again.
      </ErrorState>
    );
  }
  const ariaSort = (col: Column<T>): 'ascending' | 'descending' | 'none' | undefined =>
    !col.sortable
      ? undefined
      : sort?.key === col.key
        ? sort.dir === 'asc'
          ? 'ascending'
          : 'descending'
        : 'none';

  return (
    <div className="exq-table-wrap" data-state={state}>
      <table className="exq-table">
        <caption className="exq-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                data-align={col.align ?? 'start'}
                data-wide={col.wide ? 'true' : 'false'}
                aria-sort={ariaSort(col)}
              >
                {col.sortable && onSort ? (
                  <button
                    type="button"
                    className="exq-table__sort"
                    onClick={() => {
                      onSort(col.key);
                    }}
                  >
                    {col.header}
                    {sort?.key === col.key ? (
                      sort.dir === 'asc' ? (
                        <ArrowUp aria-hidden="true" />
                      ) : (
                        <ArrowDown aria-hidden="true" />
                      )
                    ) : null}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state === 'loading'
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="exq-table__row" data-state="loading">
                  {columns.map((col) => (
                    <td key={col.key} data-wide={col.wide ? 'true' : 'false'}>
                      <span className="exq-skeleton exq-table__skeleton">loading</span>
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="exq-table__row"
                  data-state={onOpen ? 'interactive' : 'static'}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      data-align={col.align ?? 'start'}
                      data-wide={col.wide ? 'true' : 'false'}
                    >
                      {col.primary && onOpen ? (
                        <button
                          type="button"
                          className="exq-table__open"
                          aria-label={openLabel?.(row)}
                          onClick={() => {
                            onOpen(row);
                          }}
                        >
                          {col.render(row)}
                        </button>
                      ) : (
                        col.render(row)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {state === 'ready' && rows.length === 0 ? (
        <div className="exq-table__empty">{empty}</div>
      ) : null}
      {footer ? <div className="exq-table__footer">{footer}</div> : null}
    </div>
  );
}

export { EmptyState };
