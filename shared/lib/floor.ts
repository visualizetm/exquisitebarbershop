/**
 * The floor rules for Shop, Today: which booking is in each chair, what is free and what is off.
 * Pure, so the dashboard and the tests share one reading of the same bookings.
 */

export interface FloorBookingLike {
  id: string;
  status: 'confirmed' | 'cancelled' | 'completed' | 'noShow';
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  startedAt: Date | null;
}

export interface FloorChairInput<B extends FloorBookingLike> {
  /** Confirmed bookings for this chair today, any order. */
  bookings: B[];
  /** True when the chair has hours today. */
  working: boolean;
  /** Books outside the system (Iniya: through Instagram). */
  instagramOnly: boolean;
  now: Date;
}

export interface FloorChairState<B extends FloorBookingLike> {
  kind: 'inChair' | 'free' | 'off' | 'instagram';
  current: B | null;
  next: B | null;
  /** In chair: the bar runs from the real start (Start pressed) or the booked start to the end. */
  window: { startAt: Date; endAt: Date } | null;
}

/** The booking in the chair: the one Start was pressed on, else the one whose time holds now. */
export function currentBooking<B extends FloorBookingLike>(bookings: B[], now: Date): B | null {
  const confirmed = bookings.filter((b) => b.status === 'confirmed');
  const started = confirmed
    .filter((b) => b.startedAt !== null)
    .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
  if (started[0]) return started[0];
  return (
    confirmed
      .filter((b) => b.startAt <= now && b.endAt > now)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null
  );
}

/** The window the progress bar shows for a booking in the chair. */
export function chairWindow(b: FloorBookingLike): { startAt: Date; endAt: Date } {
  const startAt = b.startedAt ?? b.startAt;
  return { startAt, endAt: new Date(startAt.getTime() + b.durationMinutes * 60_000) };
}

export function chairState<B extends FloorBookingLike>(
  input: FloorChairInput<B>,
): FloorChairState<B> {
  const { bookings, now } = input;
  const confirmed = bookings
    .filter((b) => b.status === 'confirmed')
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const current = currentBooking(confirmed, now);
  const after = current ? Math.max(now.getTime(), current.startAt.getTime()) : now.getTime();
  const next = confirmed.find((b) => b !== current && b.startAt.getTime() > after) ?? null;
  if (current) return { kind: 'inChair', current, next, window: chairWindow(current) };
  if (input.instagramOnly && confirmed.length === 0)
    return { kind: 'instagram', current: null, next: null, window: null };
  if (!input.working && confirmed.length === 0)
    return { kind: 'off', current: null, next: null, window: null };
  return { kind: 'free', current: null, next, window: null };
}

/** 0 to 1: how far the cut is along its window, by the server clock. */
export function progressOf(window: { startAt: Date; endAt: Date }, now: Date): number {
  const span = window.endAt.getTime() - window.startAt.getTime();
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - window.startAt.getTime()) / span));
}
