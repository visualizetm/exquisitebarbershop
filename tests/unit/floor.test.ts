import { describe, expect, it } from 'vitest';
import { chairState, chairWindow, progressOf, type FloorBookingLike } from '../../shared/lib/floor';

/* The clock is frozen: 1:30 PM in the shop on a March Tuesday (EST, UTC-5). */
const NOW = new Date('2026-03-10T18:30:00.000Z');
const at = (hhmm: string) => new Date(`2026-03-10T${hhmm}:00.000Z`);

function booking(
  id: string,
  start: string,
  minutes: number,
  extra: Partial<FloorBookingLike> = {},
): FloorBookingLike {
  const startAt = at(start);
  return {
    id,
    status: 'confirmed',
    startAt,
    endAt: new Date(startAt.getTime() + minutes * 60_000),
    durationMinutes: minutes,
    startedAt: null,
    ...extra,
  };
}

describe('the floor rules', () => {
  it('a booking whose time holds now is in the chair, and the next one is the one after it', () => {
    const current = booking('a', '18:00', 45);
    const next = booking('b', '19:00', 30);
    const later = booking('c', '20:00', 30);
    const state = chairState({
      bookings: [later, next, current],
      working: true,
      instagramOnly: false,
      now: NOW,
    });
    expect(state.kind).toBe('inChair');
    expect(state.current?.id).toBe('a');
    expect(state.next?.id).toBe('b');
    expect(state.window).toEqual({ startAt: at('18:00'), endAt: at('18:45') });
  });

  it('a booking Start was pressed on wins over the clock, and its window runs from the real start', () => {
    const late = booking('late', '17:30', 45, { startedAt: at('18:10') });
    const onTime = booking('ontime', '18:15', 45);
    const state = chairState({
      bookings: [onTime, late],
      working: true,
      instagramOnly: false,
      now: NOW,
    });
    expect(state.current?.id).toBe('late');
    expect(state.window).toEqual({ startAt: at('18:10'), endAt: at('18:55') });
    // The on-time booking is still next: its start is after the clock.
    expect(state.next).toBeNull();
    expect(chairWindow(late).endAt).toEqual(at('18:55'));
  });

  it('a free chair says who is next; a chair with no hours and nothing booked is off', () => {
    const next = booking('n', '19:30', 30);
    const free = chairState({ bookings: [next], working: true, instagramOnly: false, now: NOW });
    expect(free).toMatchObject({ kind: 'free', current: null, window: null });
    expect(free.next?.id).toBe('n');
    const idle = chairState({ bookings: [], working: true, instagramOnly: false, now: NOW });
    expect(idle).toEqual({ kind: 'free', current: null, next: null, window: null });
    const off = chairState({ bookings: [], working: false, instagramOnly: false, now: NOW });
    expect(off.kind).toBe('off');
  });

  it('an Instagram-only chair reads as Instagram unless something is booked in the system', () => {
    const insta = chairState({ bookings: [], working: true, instagramOnly: true, now: NOW });
    expect(insta.kind).toBe('instagram');
    const booked = chairState({
      bookings: [booking('w', '18:00', 60)],
      working: false,
      instagramOnly: true,
      now: NOW,
    });
    expect(booked.kind).toBe('inChair');
  });

  it('cancelled, done and no-show bookings never hold a chair', () => {
    const state = chairState({
      bookings: [
        booking('x', '18:00', 45, { status: 'completed', startedAt: at('18:00') }),
        booking('y', '18:10', 45, { status: 'noShow' }),
        booking('z', '18:20', 45, { status: 'cancelled' }),
      ],
      working: true,
      instagramOnly: false,
      now: NOW,
    });
    expect(state.kind).toBe('free');
    expect(state.next).toBeNull();
  });

  it('progress is the share of the window that has passed, clamped to 0 and 1', () => {
    const window = { startAt: at('18:00'), endAt: at('19:00') };
    expect(progressOf(window, NOW)).toBeCloseTo(0.5);
    expect(progressOf(window, at('17:00'))).toBe(0);
    expect(progressOf(window, at('21:00'))).toBe(1);
    expect(progressOf({ startAt: at('18:00'), endAt: at('18:00') }, NOW)).toBe(1);
  });
});
