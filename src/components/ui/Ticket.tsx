import type { ReactNode } from 'react';

export interface TicketRow {
  label: string;
  value: ReactNode;
  /** An icon that names the kind of fact: a calendar for the day, a clock for the time, a person. */
  icon?: ReactNode;
}

/** A check mark whose stroke draws itself (the stroke is animated in motion.css). */
function DrawnCheck() {
  return (
    <svg
      className="exq-ticket__check"
      viewBox="0 0 24 24"
      width="40"
      height="40"
      fill="none"
      aria-hidden="true"
    >
      <circle className="exq-ticket__check-ring" cx="12" cy="12" r="10" pathLength="1" />
      <path className="exq-ticket__check-tick" d="M7 12.5l3.2 3.2L17 8.8" pathLength="1" />
    </svg>
  );
}

/** A booking as a ticket: the reference code large on an ink head, then the facts. */
export function Ticket({
  code,
  heading = 'Your booking',
  rows,
  total,
  actions,
  state = 'confirmed',
}: {
  code: string;
  heading?: string;
  rows: TicketRow[];
  total?: ReactNode;
  actions?: ReactNode;
  state?: 'confirmed' | 'cancelled' | 'completed';
}) {
  return (
    <section className="exq-ticket" data-state={state} aria-label={`${heading} ${code}`}>
      <div className="exq-ticket__head exq-dark">
        <div>
          <p className="exq-ticket__label">{heading}</p>
          <p className="exq-ticket__code">{code}</p>
        </div>
        {state === 'confirmed' ? <DrawnCheck /> : null}
      </div>
      <dl className="exq-ticket__body">
        {rows.map((row) => (
          <div key={row.label} className="exq-ticket__row">
            <dt>
              {row.icon}
              {row.label}
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
        {total !== undefined ? (
          <div className="exq-ticket__row exq-ticket__total">
            <dt>Total</dt>
            <dd className="exq-price">{total}</dd>
          </div>
        ) : null}
      </dl>
      {actions ? <div className="exq-ticket__actions">{actions}</div> : null}
    </section>
  );
}
