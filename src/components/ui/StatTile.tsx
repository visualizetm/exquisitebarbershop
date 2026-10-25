import type { ReactNode } from 'react';

/**
 * One number with an icon, a label and (only when the data exists) a compare line such as
 * "vs last Tuesday: 9". Shows a still skeleton while loading. Never shows a made-up number.
 */
export function StatTile({
  icon,
  label,
  value,
  compare,
  loading = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  compare?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="exq-stat" data-state={loading ? 'loading' : 'ready'}>
      <span className="exq-stat__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="exq-stat__label">{label}</p>
      <p className="exq-stat__value exq-num" aria-busy={loading || undefined}>
        {loading ? <span className="exq-skeleton exq-stat__skeleton">0000</span> : value}
      </p>
      {!loading && compare ? <p className="exq-stat__compare">{compare}</p> : null}
    </div>
  );
}
