import type { ReactNode } from 'react';
import { Link } from './Link';

/** A menu line: name and one line of description, a dotted leader, then the price. */
export function PriceRow({
  name,
  description,
  price,
  meta,
  to,
  label,
}: {
  name: ReactNode;
  description?: ReactNode;
  price: ReactNode;
  /** A small note such as the duration. */
  meta?: ReactNode;
  to?: string | undefined;
  /** The accessible name when the row is a link. */
  label?: string | undefined;
}) {
  const inner = (
    <>
      <span className="exq-pricerow__main">
        <span className="exq-pricerow__name">{name}</span>
        {description ? <span className="exq-pricerow__description">{description}</span> : null}
        {meta ? <span className="exq-pricerow__meta">{meta}</span> : null}
      </span>
      <span className="exq-pricerow__leader" aria-hidden="true" />
      <span className="exq-pricerow__price exq-price">{price}</span>
    </>
  );
  return to ? (
    <Link to={to} className="exq-pricerow" aria-label={label}>
      {inner}
    </Link>
  ) : (
    <div className="exq-pricerow">{inner}</div>
  );
}
