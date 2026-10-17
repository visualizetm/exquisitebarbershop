import { Link } from 'react-router';

interface Common {
  label: string;
  /** A second line, for example the day for chips that cross days. */
  sub?: string | undefined;
  selected?: boolean;
  disabled?: boolean;
  /** The ISO start, exposed for tests and analytics. */
  startAt?: string | undefined;
}

/** One open start time. As a button it selects; as a link it jumps into /book. */
export function TimeChip({
  label,
  sub,
  selected = false,
  disabled = false,
  startAt,
  onClick,
}: Common & { onClick: () => void }) {
  return (
    <button
      type="button"
      className="exq-timechip"
      data-state={disabled ? 'disabled' : selected ? 'selected' : 'default'}
      data-start={startAt}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
      {sub ? <span className="exq-chip__sub">&nbsp;{sub}</span> : null}
    </button>
  );
}

export function TimeChipLink({ label, sub, startAt, to }: Common & { to: string }) {
  return (
    <Link to={to} className="exq-timechip" data-state="default" data-start={startAt}>
      {label}
      {sub ? <span className="exq-chip__sub">&nbsp;{sub}</span> : null}
    </Link>
  );
}
