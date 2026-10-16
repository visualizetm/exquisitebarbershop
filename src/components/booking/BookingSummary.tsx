import { formatCents } from '@shared/lib/money';
import { formatUsPhone } from '@shared/lib/phone';
import { formatShopDateTime, formatShopTime } from '@shared/lib/time';

export interface SummaryItem {
  name: string;
  priceCents: number;
  priceFrom: boolean;
  durationMinutes: number;
}

export interface BookingSummaryProps {
  services: SummaryItem[];
  staffName: string;
  startAt: string | null;
  endAt?: string | null;
  customer?: { name: string; phone: string; email: string | null } | null;
  notes?: string | null;
}

/** The same summary block is used before confirming, on the success screen and on the manage page. */
export function BookingSummary({
  services,
  staffName,
  startAt,
  endAt,
  customer,
  notes,
}: BookingSummaryProps) {
  const total = services.reduce((sum, s) => sum + s.priceCents, 0);
  const anyFrom = services.some((s) => s.priceFrom);
  return (
    <dl className="exq-booking-summary" data-state={startAt ? 'complete' : 'partial'}>
      <div className="exq-booking-summary__row">
        <dt>Services</dt>
        <dd>
          <ul className="exq-booking-summary__services">
            {services.map((s) => (
              <li key={s.name}>
                {s.name} ({s.durationMinutes} min)
              </li>
            ))}
          </ul>
        </dd>
      </div>
      <div className="exq-booking-summary__row">
        <dt>Chair</dt>
        <dd>{staffName}</dd>
      </div>
      <div className="exq-booking-summary__row">
        <dt>When</dt>
        <dd>
          {startAt ? formatShopDateTime(new Date(startAt)) : 'Not chosen yet'}
          {startAt && endAt ? ` to ${formatShopTime(new Date(endAt))}` : ''}
        </dd>
      </div>
      <div className="exq-booking-summary__row">
        <dt>Total</dt>
        <dd>
          {anyFrom ? 'From ' : ''}
          {formatCents(total)}
        </dd>
      </div>
      {customer ? (
        <div className="exq-booking-summary__row">
          <dt>For</dt>
          <dd>
            {customer.name}, {formatUsPhone(customer.phone)}
            {customer.email ? `, ${customer.email}` : ''}
          </dd>
        </div>
      ) : null}
      {notes ? (
        <div className="exq-booking-summary__row">
          <dt>Notes</dt>
          <dd>{notes}</dd>
        </div>
      ) : null}
    </dl>
  );
}
