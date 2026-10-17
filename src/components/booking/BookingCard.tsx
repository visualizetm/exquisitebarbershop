import { formatCents, priceLabel } from '@shared/lib/money';
import { formatShopDateTime } from '@shared/lib/time';
import { Button } from '@/components/ui';
import { cancelPolicyLabel } from '@/lib/booking/helpers';
import type { SummaryItem } from './BookingSummary';

export interface BookingCardProps {
  services: (SummaryItem & { id: string })[];
  staffName: string | null;
  startAt: string | null;
  cancelCutoffMinutes: number;
  /** True on the confirm step, once the details have been checked. */
  canConfirm: boolean;
  submitting: boolean;
  onConfirm: () => void;
}

/**
 * The sticky summary on wide screens: an ink card with the wordmark, what was
 * chosen so far, the total and the confirm button. Below 1024px the StickyCTA
 * bar carries the same total instead (CSS hides this card).
 */
export function BookingCard({
  services,
  staffName,
  startAt,
  cancelCutoffMinutes,
  canConfirm,
  submitting,
  onConfirm,
}: BookingCardProps) {
  const total = services.reduce((sum, s) => sum + s.priceCents, 0);
  const anyFrom = services.some((s) => s.priceFrom);
  return (
    <aside
      className="exq-book-card exq-dark"
      aria-label="Your booking"
      data-state={canConfirm ? 'ready' : services.length === 0 ? 'empty' : 'partial'}
    >
      <img
        className="exq-book-card__mark"
        src="/brand/exq-wordmark-white.svg"
        alt=""
        width={200}
        height={51}
      />
      <p className="exq-book-card__label exq-label">Your booking</p>
      {services.length === 0 ? (
        <p className="exq-book-card__empty">Pick a service to start.</p>
      ) : (
        <ul className="exq-book-card__services">
          {services.map((s) => (
            <li key={s.id} className="exq-book-card__service">
              <span>{s.name}</span>
              <span className="exq-price">{priceLabel(s)}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="exq-book-card__facts">
        <div>
          <dt>With</dt>
          <dd>{staffName ?? 'Pick a chair'}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{startAt ? formatShopDateTime(new Date(startAt)) : 'Pick a day and time'}</dd>
        </div>
      </dl>
      <p className="exq-book-card__total">
        <span>Total</span>
        <strong className="exq-price">
          {anyFrom ? 'From ' : ''}
          {formatCents(total)}
        </strong>
      </p>
      <Button
        variant="emphasis"
        size="lg"
        block
        disabled={!canConfirm}
        loading={submitting}
        onClick={onConfirm}
      >
        {submitting ? 'Booking' : 'Confirm booking'}
      </Button>
      <p className="exq-book-card__note">
        Pay in the chair. {cancelPolicyLabel(cancelCutoffMinutes)}
      </p>
    </aside>
  );
}
