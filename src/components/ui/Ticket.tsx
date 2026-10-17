import type { ReactNode } from 'react';

export interface TicketRow {
  label: string;
  value: ReactNode;
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
      <div className="exq-ticket__head">
        <p className="exq-ticket__label">{heading}</p>
        <p className="exq-ticket__code">{code}</p>
      </div>
      <dl className="exq-ticket__body">
        {rows.map((row) => (
          <div key={row.label} className="exq-ticket__row">
            <dt>{row.label}</dt>
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
