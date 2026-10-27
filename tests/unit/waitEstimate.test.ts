import { describe, expect, it } from 'vitest';
import {
  estimateForChair,
  estimateInLine,
  firstFit,
  type ChairLoad,
} from '../../shared/lib/waitEstimate';

/* The clock is frozen at 2:14 PM in the shop (EDT, UTC-4) on a Tuesday. */
const NOW = new Date('2026-10-27T18:14:00.000Z');
const at = (hhmm: string) => new Date(`2026-10-27T${hhmm}:00.000Z`);
const span = (a: string, b: string) => ({ startAt: at(a), endAt: at(b) });
const chair = (staffId: string, extra: Partial<ChairLoad> = {}): ChairLoad => ({
  staffId,
  working: true,
  busyUntil: null,
  bookings: [],
  ...extra,
});

describe('the wait estimate', () => {
  it('a free chair with nothing booked is free now', () => {
    expect(estimateForChair(chair('a'), [], 45, NOW)).toEqual({ kind: 'free' });
  });

  it('a chair in a cut is free when the cut ends, in minutes from now', () => {
    const e = estimateForChair(chair('a', { busyUntil: at('18:50') }), [], 45, NOW);
    expect(e).toEqual({ kind: 'about', at: at('18:50'), minutes: 36 });
  });

  it('a service that does not fit before the next booking waits until after it', () => {
    // Free now, but a 30 minute booking starts in 15 minutes: a 45 minute cut goes after it.
    const load = chair('a', { bookings: [span('18:29', '18:59')] });
    expect(estimateForChair(load, [], 45, NOW)).toEqual({
      kind: 'about',
      at: at('18:59'),
      minutes: 45,
    });
    // A 10 minute lineup fits in the gap and is free now.
    expect(estimateForChair(load, [], 10, NOW)).toEqual({ kind: 'free' });
  });

  it('people ahead in the line take the chair first', () => {
    const e = estimateForChair(chair('a', { busyUntil: at('18:30') }), [20, 45], 30, NOW);
    expect(e).toEqual({ kind: 'about', at: at('19:35'), minutes: 81 });
  });

  it('a chair with no hours today is unknown, as is a service with no length', () => {
    expect(estimateForChair(chair('a', { working: false }), [], 45, NOW)).toEqual({
      kind: 'unknown',
    });
    expect(estimateForChair(chair('a'), [], 0, NOW)).toEqual({ kind: 'unknown' });
  });

  it('first available goes to whichever chair frees up first, after the people ahead', () => {
    const chairs = [
      chair('a', { busyUntil: at('18:50') }),
      chair('b', { busyUntil: at('18:30') }),
      chair('c', { working: false }),
    ];
    const line = [
      { staffId: 'b', minutes: 45 }, // b is taken until 19:15
      { staffId: null, minutes: 30 }, // first available: a at 18:50
      { staffId: null, minutes: 30 }, // next: b at 19:15 beats a at 19:20
    ];
    expect(estimateInLine(chairs, line, 1, NOW)).toEqual({
      estimate: { kind: 'about', at: at('18:50'), minutes: 36 },
      staffId: 'a',
    });
    expect(estimateInLine(chairs, line, 2, NOW)).toEqual({
      estimate: { kind: 'about', at: at('19:15'), minutes: 61 },
      staffId: 'b',
    });
    // Nobody working: unknown.
    expect(estimateInLine([chair('c', { working: false })], line, 0, NOW)).toEqual({
      estimate: { kind: 'unknown' },
      staffId: null,
    });
  });

  it('firstFit skips every clash and never loops forever', () => {
    const fit = firstFit(NOW, 30, [span('18:00', '18:20'), span('18:30', '19:00')]);
    expect(fit).toEqual(at('19:00'));
    expect(firstFit(NOW, 10, [])).toEqual(NOW);
  });
});
