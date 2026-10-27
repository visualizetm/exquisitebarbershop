import { DateTime } from 'luxon';
import { SHOP_TIMEZONE } from './constants';

/**
 * The hours rule for NOW and the walk-in line. Pure: the caller passes today's shop ranges, the
 * barber's ranges and the next opening; the helper says whether a walk-in can be taken right now
 * and, when not, why, in the words the tile shows.
 */
export interface OpenSpan {
  start: Date;
  end: Date;
}

export type NowGate =
  | { kind: 'open' }
  | { kind: 'closed'; opensAt: Date | null }
  | { kind: 'off'; name: string }
  | { kind: 'done'; name: string }
  | { kind: 'nobody' };

export interface NowGateView {
  kind: NowGate['kind'];
  /** Null when open; else the sentence the tile shows. */
  text: string | null;
}

export function isOpenAt(ranges: readonly OpenSpan[], now: Date): boolean {
  return ranges.some((r) => r.start.getTime() <= now.getTime() && now.getTime() < r.end.getTime());
}

/** One chair right now: the shop must be open, the barber in today and not finished. */
export function chairGate(
  chair: { name: string; ranges: readonly OpenSpan[] },
  shopRanges: readonly OpenSpan[],
  now: Date,
  opensAt: Date | null,
): NowGate {
  if (!isOpenAt(shopRanges, now)) return { kind: 'closed', opensAt };
  if (chair.ranges.length === 0) return { kind: 'off', name: chair.name };
  if (chair.ranges.every((r) => r.end.getTime() <= now.getTime()))
    return { kind: 'done', name: chair.name };
  return { kind: 'open' };
}

/** First available: the shop open and at least one barber in. */
export function firstAvailableGate(
  chairs: readonly { name: string; ranges: readonly OpenSpan[] }[],
  shopRanges: readonly OpenSpan[],
  now: Date,
  opensAt: Date | null,
): NowGate {
  if (!isOpenAt(shopRanges, now)) return { kind: 'closed', opensAt };
  const anyone = chairs.some((c) => chairGate(c, shopRanges, now, opensAt).kind === 'open');
  return anyone ? { kind: 'open' } : { kind: 'nobody' };
}

/** "Tue 10 AM", "Tue 10:30 AM". */
export function opensLabel(at: Date): string {
  const dt = DateTime.fromJSDate(at).setZone(SHOP_TIMEZONE);
  return dt.minute === 0 ? dt.toFormat('ccc h a') : dt.toFormat('ccc h:mm a');
}

export function gateText(gate: NowGate): string | null {
  switch (gate.kind) {
    case 'open':
      return null;
    case 'closed':
      return gate.opensAt
        ? `The shop is closed right now. Opens ${opensLabel(gate.opensAt)}.`
        : 'The shop is closed right now.';
    case 'off':
      return `${gate.name} is off today.`;
    case 'done':
      return `${gate.name} is done for the day.`;
    case 'nobody':
      return 'Nobody is in right now.';
  }
}

export function gateView(gate: NowGate): NowGateView {
  return { kind: gate.kind, text: gateText(gate) };
}
