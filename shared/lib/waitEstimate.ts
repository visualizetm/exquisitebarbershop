/**
 * Wait estimates for the walk-in line. Pure: the caller passes what each chair is doing (the
 * current cut's end, the rest of today's bookings) and who is ahead in the line; the helper says
 * "free now", "about 2:50" with the minutes, or "unknown" when the data cannot support a number.
 */

export interface Span {
  startAt: Date;
  endAt: Date;
}

export interface ChairLoad {
  staffId: string;
  /** False when the chair has no hours today: no estimate is possible. */
  working: boolean;
  /** When the cut in the chair ends (from the real start when Start was pressed), or null. */
  busyUntil: Date | null;
  /** Today's confirmed bookings still ahead, in any order. */
  bookings: Span[];
}

export type WaitEstimate =
  { kind: 'free' } | { kind: 'about'; at: Date; minutes: number } | { kind: 'unknown' };

const MINUTE = 60_000;
/** A start within this many minutes of now still reads as "free now". */
const FREE_GRACE_MINUTES = 1;

/** The first time at or after `from` where `minutes` fit before the next booking on the chair. */
export function firstFit(from: Date, minutes: number, bookings: readonly Span[]): Date {
  const sorted = [...bookings].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  let t = from.getTime();
  for (let guard = 0; guard < 100; guard += 1) {
    const end = t + minutes * MINUTE;
    const clash = sorted.find((b) => b.startAt.getTime() < end && b.endAt.getTime() > t);
    if (!clash) return new Date(t);
    t = Math.max(t, clash.endAt.getTime());
  }
  return new Date(t);
}

function toEstimate(at: Date, now: Date): WaitEstimate {
  const minutes = Math.ceil((at.getTime() - now.getTime()) / MINUTE);
  if (minutes <= FREE_GRACE_MINUTES) return { kind: 'free' };
  return { kind: 'about', at, minutes };
}

/**
 * One chair: the people ahead (their service minutes, in line order) take the chair first, then
 * this person's service has to fit before the next booking.
 */
export function estimateForChair(
  chair: ChairLoad,
  aheadMinutes: readonly number[],
  serviceMinutes: number,
  now: Date,
): WaitEstimate {
  if (!chair.working) return { kind: 'unknown' };
  if (!Number.isFinite(serviceMinutes) || serviceMinutes <= 0) return { kind: 'unknown' };
  let t = chair.busyUntil && chair.busyUntil > now ? chair.busyUntil : now;
  for (const ahead of aheadMinutes) {
    const start = firstFit(t, ahead, chair.bookings);
    t = new Date(start.getTime() + ahead * MINUTE);
  }
  return toEstimate(firstFit(t, serviceMinutes, chair.bookings), now);
}

export interface PoolPerson {
  /** The chair they wait for, or null for first available. */
  staffId: string | null;
  minutes: number;
}

/**
 * The whole line against every chair: each person ahead goes to their own chair, or, for first
 * available, to whichever chair frees up first. Returns the estimate for the person at `index`
 * and, for a first available person, which chair it is. Unknown when no chair works today.
 */
export function estimateInLine(
  chairs: readonly ChairLoad[],
  line: readonly PoolPerson[],
  index: number,
  now: Date,
): { estimate: WaitEstimate; staffId: string | null } {
  const working = chairs.filter((c) => c.working);
  if (working.length === 0) return { estimate: { kind: 'unknown' }, staffId: null };
  // Free time per chair, moved forward as each person ahead is placed.
  const free = new Map(
    working.map((c) => [c.staffId, c.busyUntil && c.busyUntil > now ? c.busyUntil : now]),
  );
  const place = (person: PoolPerson): { at: Date; staffId: string } | null => {
    const candidates = person.staffId
      ? working.filter((c) => c.staffId === person.staffId)
      : working;
    let best: { at: Date; chair: ChairLoad } | null = null;
    for (const chair of candidates) {
      const at = firstFit(free.get(chair.staffId) ?? now, person.minutes, chair.bookings);
      if (!best || at < best.at) best = { at, chair };
    }
    if (!best) return null;
    free.set(best.chair.staffId, new Date(best.at.getTime() + person.minutes * MINUTE));
    return { at: best.at, staffId: best.chair.staffId };
  };
  for (let i = 0; i < index; i += 1) {
    const person = line[i];
    if (person) place(person);
  }
  const me = line[index];
  if (!me) return { estimate: { kind: 'unknown' }, staffId: null };
  const placed = place(me);
  if (!placed) return { estimate: { kind: 'unknown' }, staffId: null };
  return { estimate: toEstimate(placed.at, now), staffId: placed.staffId };
}
