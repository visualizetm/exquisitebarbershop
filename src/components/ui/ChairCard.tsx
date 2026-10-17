import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PhotoArch, type Photo } from './PhotoArch';

export type ChairStatus = 'next-open' | 'in' | 'off' | 'closed' | 'none';

export interface ChairCardProps {
  name: string;
  specialty?: string | undefined;
  chairNumber?: number | null | undefined;
  photo: Photo | null;
  status?: ChairStatus;
  /** "Next open 2:15 PM", "Off today", "Closed today". */
  statusLabel?: string | undefined;
  /** The whole card links here. */
  to?: string | undefined;
  selected?: boolean;
  onSelect?: (() => void) | undefined;
  priority?: boolean;
}

function chairBadge(n: number | null | undefined): string | null {
  return n === null || n === undefined ? null : `Chair ${String(n).padStart(2, '0')}`;
}

/** A barber as a card: photo, chair badge, name, specialty and today's status. */
export function ChairCard(props: ChairCardProps) {
  const {
    name,
    specialty,
    chairNumber,
    photo,
    status = 'none',
    statusLabel,
    to,
    selected = false,
    onSelect,
    priority = false,
  } = props;
  const badge = chairBadge(chairNumber);
  const body = (
    <>
      <PhotoArch photo={photo} name={name} priority={priority} />
      <span className="exq-chaircard__body">
        {badge ? <span className="exq-chaircard__badge">{badge}</span> : null}
        <span className="exq-chaircard__name exq-h">{name}</span>
        {specialty ? <span className="exq-chaircard__specialty">{specialty}</span> : null}
        {statusLabel ? (
          <span className="exq-chaircard__status" data-state={status}>
            {status === 'next-open' || status === 'in' ? (
              <span className="exq-chaircard__dot" aria-hidden="true" />
            ) : null}
            {statusLabel}
          </span>
        ) : null}
      </span>
    </>
  );
  const state = selected ? 'selected' : status;
  if (to) {
    return (
      <Link
        to={to}
        className="exq-chaircard"
        data-state={state}
        aria-label={`${name}, ${badge ?? 'chair'}`}
      >
        {body}
      </Link>
    );
  }
  if (onSelect) {
    return (
      <button
        type="button"
        className="exq-chaircard"
        data-state={state}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {body}
      </button>
    );
  }
  return (
    <div className="exq-chaircard" data-state={state}>
      {body}
    </div>
  );
}

/** The same card while its data loads. */
export function ChairCardSkeleton(): ReactNode {
  return (
    <div className="exq-chaircard" data-state="loading" aria-hidden="true">
      <span className="exq-arch exq-skeleton" data-state="loading" />
      <span className="exq-chaircard__body">
        <span className="exq-skeleton">Chair 00</span>
        <span className="exq-skeleton exq-chaircard__name">Loading name</span>
        <span className="exq-skeleton exq-chaircard__specialty">Loading specialty</span>
      </span>
    </div>
  );
}
