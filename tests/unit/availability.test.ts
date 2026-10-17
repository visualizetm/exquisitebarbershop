import { describe, expect, it } from 'vitest';
import {
  bookingWindowEnd,
  computeAvailability,
  effectiveBufferMinutes,
  findSlot,
  intersectRanges,
  isDateInWindow,
  isWithinWorkingTime,
  isOnSlotGrid,
  mergeRanges,
  nextOpenSlots,
  rankCandidates,
  resolveStaffSelector,
  shopRangesFor,
  staffQualifies,
  subtractRanges,
  workingRangesFor,
} from '../../server/services/availability';
import { shopLocalToUtc } from '../../shared/lib/time';
import {
  at,
  block,
  booking,
  closure,
  context,
  FIXTURE_NOW,
  hhmmList,
  nineToFive,
  service,
  settings,
  staff,
} from '../helpers/availabilityFixtures';

// FIXTURE_NOW is Tue 2026-03-10 11:00 EDT. The default window is 30 days.
const DATE = '2026-03-12'; // Thursday
const cut = service({ name: 'Cut', durationMinutes: 30 });
const beard = service({ name: 'Beard', durationMinutes: 15 });
const braids = service({ name: 'Braids', group: 'Beauty', durationMinutes: 60, bufferMinutes: 20 });

function barber(overrides = {}) {
  return staff({ serviceIds: [cut._id, beard._id], ...overrides });
}

function oneDay(ctx: ReturnType<typeof context>, selector = 'any', date = DATE) {
  const result = computeAvailability({ fromDate: date, toDate: date, staff: selector }, ctx);
  const day = result.days[0];
  if (!day) throw new Error('no day');
  return { result, day };
}

describe('availability: helpers', () => {
  it('resolves a staff selector by id, slug or alias', () => {
    const a = staff({
      slug: 'alpha',
      slugAliases: ['old-alpha'],
      slugKeys: ['alpha', 'old-alpha'],
    });
    expect(resolveStaffSelector([a], 'any')).toBeNull();
    expect(resolveStaffSelector([a], a._id)?._id).toBe(a._id);
    expect(resolveStaffSelector([a], 'alpha')?._id).toBe(a._id);
    expect(resolveStaffSelector([a], 'old-alpha')?._id).toBe(a._id);
    expect(resolveStaffSelector([a], 'nobody')).toBeNull();
  });

  it('qualification needs live, bookable staff who do every service', () => {
    const b = barber();
    expect(staffQualifies(b, [cut, beard])).toBe(true);
    expect(staffQualifies(b, [cut, braids])).toBe(false);
    expect(staffQualifies({ ...b, deletedAt: FIXTURE_NOW }, [cut])).toBe(false);
    expect(staffQualifies({ ...b, showOnWebsite: false }, [cut])).toBe(false);
    expect(staffQualifies({ ...b, acceptsOnlineBooking: false }, [cut])).toBe(false);
  });

  it('effective buffer is the shop default unless a service needs more', () => {
    const s = settings({ bufferMinutes: 10 });
    expect(effectiveBufferMinutes([cut], s)).toBe(10);
    expect(effectiveBufferMinutes([cut, braids], s)).toBe(20);
    expect(effectiveBufferMinutes([service({ bufferMinutes: 0 })], s)).toBe(0);
    expect(effectiveBufferMinutes([], s)).toBe(10);
  });

  it('window end and membership are shop-local', () => {
    expect(bookingWindowEnd(FIXTURE_NOW, settings())).toBe('2026-04-09');
    expect(isDateInWindow('2026-03-10', FIXTURE_NOW, settings())).toBe(true);
    expect(isDateInWindow('2026-03-09', FIXTURE_NOW, settings())).toBe(false);
    expect(isDateInWindow('2026-04-09', FIXTURE_NOW, settings())).toBe(true);
    expect(isDateInWindow('2026-04-10', FIXTURE_NOW, settings())).toBe(false);
  });

  it('merges, intersects and subtracts ranges', () => {
    const r = (a: string, b: string) => ({ start: at(DATE, a), end: at(DATE, b) });
    expect(
      mergeRanges([
        r('10:00', '11:00'),
        r('10:30', '12:00'),
        r('13:00', '14:00'),
        r('13:30', '13:45'),
      ]),
    ).toEqual([r('10:00', '12:00'), r('13:00', '14:00')]);
    expect(
      intersectRanges(
        [r('09:00', '12:00')],
        [r('11:00', '13:00'), r('08:00', '09:30'), r('12:00', '13:00')],
      ),
    ).toEqual([r('09:00', '09:30'), r('11:00', '12:00')]);
    expect(subtractRanges([r('09:00', '17:00')], [r('12:00', '13:00')])).toEqual([
      r('09:00', '12:00'),
      r('13:00', '17:00'),
    ]);
    expect(
      subtractRanges([r('09:00', '17:00')], [r('08:00', '10:00'), r('16:00', '18:00')]),
    ).toEqual([r('10:00', '16:00')]);
    expect(subtractRanges([r('09:00', '17:00')], [r('08:00', '18:00')])).toEqual([]);
    expect(subtractRanges([r('09:00', '10:00')], [r('11:00', '12:00')])).toEqual([
      r('09:00', '10:00'),
    ]);
  });

  it('shop ranges follow closures then weekly hours', () => {
    expect(shopRangesFor(DATE, 'thu', nineToFive, [closure(DATE)])).toBeNull();
    expect(
      shopRangesFor(DATE, 'thu', nineToFive, [
        closure(DATE, { kind: 'specialHours', intervals: [{ start: '10:00', end: '12:00' }] }),
      ]),
    ).toEqual([{ start: at(DATE, '10:00'), end: at(DATE, '12:00') }]);
    expect(shopRangesFor('2026-03-15', 'sun', nineToFive, [])).toBeNull();
    expect(shopRangesFor(DATE, 'thu', null, [])).toBeNull();
  });

  it('ranks candidates by booked minutes or round robin', () => {
    const a = staff({ sortOrder: 2 });
    const b = staff({ sortOrder: 1 });
    const booked = new Map([[b._id, 90]]);
    expect(rankCandidates([a, b], booked, 'leastBookedThatDay', 0).map((s) => s._id)).toEqual([
      a._id,
      b._id,
    ]);
    expect(rankCandidates([a, b], new Map(), 'leastBookedThatDay', 0).map((s) => s._id)).toEqual([
      b._id,
      a._id,
    ]);
    expect(rankCandidates([a, b], new Map(), 'roundRobin', 0).map((s) => s._id)).toEqual([
      b._id,
      a._id,
    ]);
    expect(rankCandidates([a, b], new Map(), 'roundRobin', 1).map((s) => s._id)).toEqual([
      a._id,
      b._id,
    ]);
    // Equal display order falls back to the id so the result is stable.
    const c = staff({ sortOrder: 1 });
    const d = staff({ sortOrder: 1 });
    const [lower, higher] = c._id < d._id ? [c, d] : [d, c];
    expect(
      rankCandidates([higher, lower], new Map(), 'leastBookedThatDay', 0).map((s) => s._id),
    ).toEqual([lower._id, higher._id]);
  });

  it('checks the slot grid', () => {
    expect(isOnSlotGrid(at(DATE, '09:15'), settings())).toBe(true);
    expect(isOnSlotGrid(at(DATE, '09:10'), settings())).toBe(false);
    expect(isOnSlotGrid(at(DATE, '09:15'), settings({ slotStepMinutes: 30 }))).toBe(false);
  });
});

describe('availability: one chair, one day', () => {
  it('offers every step from open to the last slot that fits before closing', () => {
    const b = barber();
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
    });
    const { day, result } = oneDay(ctx, b.slug);
    expect(result.totalMinutes).toBe(30);
    expect(day.reason).toBeNull();
    const times = hhmmList(day.slots.map((s) => s.startAt));
    expect(times[0]).toBe('09:00');
    expect(times[times.length - 1]).toBe('16:30');
    expect(times).toHaveLength(31);
    expect(day.slots[0]?.staffId).toBe(b._id);
    expect(day.slots[0]?.candidates).toEqual([b._id]);
  });

  it('closing edge: the services must end by closing but the buffer may run past it', () => {
    const b = barber();
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
      settings: settings({ bufferMinutes: 10 }),
    });
    const { day, result } = oneDay(ctx, b.slug);
    expect(result.totalMinutes).toBe(40);
    // 16:30 + 30 min ends exactly at 17:00; its 10 minute buffer runs to 17:10.
    expect(hhmmList(day.slots.map((s) => s.startAt)).at(-1)).toBe('16:30');
    expect(hhmmList(day.slots.map((s) => s.startAt))).not.toContain('16:45');
  });

  it('the buffer past the end of one range still may not overlap a booking', () => {
    const b = barber();
    // Working 09:00 to 12:00 and 12:15 to 17:00 because of a short time off at 12:00.
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
      settings: settings({ bufferMinutes: 10 }),
      timeBlocks: [
        block({
          staffId: b._id,
          kind: 'timeOff',
          startAt: at(DATE, '12:00'),
          endAt: at(DATE, '12:15'),
        }),
      ],
      bookings: [booking({ staffId: b._id, startAt: at(DATE, '12:15'), durationMinutes: 30 })],
    });
    const times = hhmmList(oneDay(ctx, b.slug).day.slots.map((s) => s.startAt));
    // 11:30 ends at 12:00 and its buffer reaches only 12:10, before the 12:15 booking.
    expect(times).toContain('11:30');
    const tight = context({
      ...ctx,
      bookings: [booking({ staffId: b._id, startAt: at(DATE, '12:00'), durationMinutes: 30 })],
      timeBlocks: [],
    });
    // With the chair booked from 12:00, an 11:30 start would push its buffer into that booking.
    expect(hhmmList(oneDay(tight, b.slug).day.slots.map((s) => s.startAt))).not.toContain('11:30');
  });

  it('per-service buffer widens the total and the busy ranges of existing bookings count their own buffer', () => {
    const b = staff({ serviceIds: [cut._id, braids._id] });
    const existing = booking({
      staffId: b._id,
      startAt: at(DATE, '09:00'),
      durationMinutes: 30,
      bufferMinutes: 10,
    });
    const ctx = context({
      services: [cut, braids],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
      settings: settings({ bufferMinutes: 10 }),
      bookings: [existing],
    });
    const { day, result } = oneDay(ctx, b.slug);
    expect(result.bufferMinutes).toBe(20);
    expect(result.totalMinutes).toBe(110);
    const times = hhmmList(day.slots.map((s) => s.startAt));
    // 09:00 booking blocks until 09:40; first grid start after that is 09:45.
    expect(times[0]).toBe('09:45');
    // The 90 minutes of services must end by 17:00; the 20 minute buffer may run past.
    expect(times.at(-1)).toBe('15:30');
  });

  it('multi-service chaining uses the sum of durations on the same chair', () => {
    const b = barber();
    const ctx = context({
      services: [cut, beard],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
    });
    const { day, result } = oneDay(ctx, b.slug);
    expect(result.serviceMinutes).toBe(45);
    expect(day.slots[0]?.endAt).toEqual(at(DATE, '09:45'));
    expect(hhmmList(day.slots.map((s) => s.startAt)).at(-1)).toBe('16:15');
  });

  it('lead time hides starts that are too soon and reports outsideWindow for today once nothing remains', () => {
    const b = barber();
    const today = '2026-03-10';
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
      settings: settings({ leadTimeMinutes: 60 }),
    });
    const { day } = oneDay(ctx, b.slug, today);
    // now is 11:00 EDT, lead 60 min: first start 12:00.
    expect(hhmmList(day.slots.map((s) => s.startAt))[0]).toBe('12:00');
    const late = context({ ...ctx, now: at(today, '16:30') });
    const lateDay = oneDay(late, b.slug, today).day;
    expect(lateDay.slots).toEqual([]);
    expect(lateDay.reason).toBe('outsideWindow');
  });

  it('existing bookings and blocks remove overlapping starts and a full day reads fullyBooked', () => {
    const b = barber();
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
      bookings: [booking({ staffId: b._id, startAt: at(DATE, '10:00'), durationMinutes: 60 })],
      timeBlocks: [
        block({
          staffId: b._id,
          startAt: at(DATE, '12:00'),
          endAt: at(DATE, '13:00'),
          kind: 'block',
        }),
      ],
    });
    const times = hhmmList(oneDay(ctx, b.slug).day.slots.map((s) => s.startAt));
    expect(times).not.toContain('09:45');
    expect(times).not.toContain('10:00');
    expect(times).not.toContain('10:45');
    expect(times).toContain('11:00');
    expect(times).not.toContain('11:45');
    expect(times).not.toContain('12:30');
    expect(times).toContain('13:00');

    const full = context({
      ...ctx,
      timeBlocks: [],
      bookings: [booking({ staffId: b._id, startAt: at(DATE, '09:00'), durationMinutes: 8 * 60 })],
    });
    const fullDay = oneDay(full, b.slug).day;
    expect(fullDay.slots).toEqual([]);
    expect(fullDay.reason).toBe('fullyBooked');
  });

  it('a cancelled booking and another chair do not count as busy', () => {
    const b = barber();
    const other = barber();
    const ctx = context({
      services: [cut],
      staff: [b, other],
      staffHours: new Map([
        [b._id, nineToFive],
        [other._id, nineToFive],
      ]),
      bookings: [
        booking({ staffId: b._id, startAt: at(DATE, '10:00'), status: 'cancelled' }),
        booking({ staffId: other._id, startAt: at(DATE, '11:00') }),
      ],
    });
    const times = hhmmList(oneDay(ctx, b.slug).day.slots.map((s) => s.startAt));
    expect(times).toContain('10:00');
    expect(times).toContain('11:00');
  });

  it('excludeBookingId frees the booking being rescheduled', () => {
    const b = barber();
    const mine = booking({ staffId: b._id, startAt: at(DATE, '10:00') });
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
      bookings: [mine],
    });
    const without = computeAvailability({ fromDate: DATE, toDate: DATE, staff: b.slug }, ctx)
      .days[0];
    const withExclude = computeAvailability(
      { fromDate: DATE, toDate: DATE, staff: b.slug, excludeBookingId: mine._id },
      ctx,
    ).days[0];
    expect(hhmmList(without?.slots.map((s) => s.startAt) ?? [])).not.toContain('10:00');
    expect(hhmmList(withExclude?.slots.map((s) => s.startAt) ?? [])).toContain('10:00');
  });

  it('dayOff: no staff hours, a dayOff block, or timeOff covering the day', () => {
    const b = barber();
    expect(oneDay(context({ services: [cut], staff: [b] }), b.slug).day.reason).toBe('dayOff');
    const off = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
      timeBlocks: [
        block({
          staffId: b._id,
          kind: 'dayOff',
          startAt: at(DATE, '00:00'),
          endAt: at('2026-03-13', '00:00'),
        }),
      ],
    });
    expect(oneDay(off, b.slug).day.reason).toBe('dayOff');
    const vacation = context({
      ...off,
      timeBlocks: [
        block({
          staffId: b._id,
          kind: 'timeOff',
          startAt: at('2026-03-09', '00:00'),
          endAt: at('2026-03-20', '00:00'),
        }),
      ],
    });
    expect(oneDay(vacation, b.slug).day.reason).toBe('dayOff');
    expect(oneDay(vacation, b.slug).day.byStaff[0]?.reason).toBe('dayOff');
  });

  it('a partial timeOff block only removes its hours', () => {
    const b = barber();
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
      timeBlocks: [
        block({
          staffId: b._id,
          kind: 'timeOff',
          startAt: at(DATE, '09:00'),
          endAt: at(DATE, '13:00'),
        }),
      ],
    });
    expect(hhmmList(oneDay(ctx, b.slug).day.slots.map((s) => s.startAt))[0]).toBe('13:00');
  });

  it('extraHours adds working time on a day off, clipped to shop hours and the day', () => {
    const b = barber();
    const sunday = '2026-03-15';
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, { ...nineToFive, thu: [] }]]),
      timeBlocks: [
        block({
          staffId: b._id,
          kind: 'extraHours',
          startAt: at(DATE, '13:00'),
          endAt: at(DATE, '19:00'),
        }),
      ],
    });
    const times = hhmmList(oneDay(ctx, b.slug).day.slots.map((s) => s.startAt));
    expect(times[0]).toBe('13:00');
    expect(times.at(-1)).toBe('16:30');
    // Shop is closed Sunday, so extra hours cannot open it.
    const sundayCtx = context({
      ...ctx,
      timeBlocks: [
        block({
          staffId: b._id,
          kind: 'extraHours',
          startAt: at(sunday, '10:00'),
          endAt: at(sunday, '12:00'),
        }),
      ],
    });
    expect(oneDay(sundayCtx, b.slug, sunday).day.reason).toBe('closed');
    // Extra hours spilling past midnight are clipped to the day.
    const lateCtx = context({
      ...ctx,
      shopHours: { ...nineToFive, thu: [{ start: '09:00', end: '23:59' }] },
      timeBlocks: [
        block({
          staffId: b._id,
          kind: 'extraHours',
          startAt: at(DATE, '22:00'),
          endAt: at('2026-03-13', '02:00'),
        }),
      ],
    });
    const late = hhmmList(oneDay(lateCtx, b.slug).day.slots.map((s) => s.startAt));
    expect(late[0]).toBe('22:00');
    expect(late.at(-1)).toBe('23:15');
  });

  it('closures: closed day and special hours', () => {
    const b = barber();
    const base = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
    });
    expect(oneDay(context({ ...base, closures: [closure(DATE)] }), b.slug).day.reason).toBe(
      'closed',
    );
    const special = context({
      ...base,
      closures: [
        closure(DATE, { kind: 'specialHours', intervals: [{ start: '10:00', end: '12:00' }] }),
      ],
    });
    expect(hhmmList(oneDay(special, b.slug).day.slots.map((s) => s.startAt))).toEqual([
      '10:00',
      '10:15',
      '10:30',
      '10:45',
      '11:00',
      '11:15',
      '11:30',
    ]);
  });

  it('window limit and past dates read outsideWindow; a Sunday reads closed', () => {
    const b = barber();
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
    });
    expect(oneDay(ctx, b.slug, '2026-03-09').day.reason).toBe('outsideWindow');
    expect(oneDay(ctx, b.slug, '2026-04-10').day.reason).toBe('outsideWindow');
    expect(oneDay(ctx, b.slug, '2026-04-09').day.reason).toBeNull();
    expect(oneDay(ctx, b.slug, '2026-03-15').day.reason).toBe('closed');
  });

  it('noQualifiedStaff: unknown slug, a chair that does not do beauty, or a hidden chair', () => {
    const b = barber();
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
    });
    expect(oneDay(ctx, 'nobody').day.reason).toBe('noQualifiedStaff');
    const beauty = context({ ...ctx, services: [braids] });
    expect(oneDay(beauty, 'any').day.reason).toBe('noQualifiedStaff');
    expect(oneDay(beauty, b.slug).day.reason).toBe('noQualifiedStaff');
    const hidden = context({ ...ctx, staff: [{ ...b, showOnWebsite: false }] });
    expect(oneDay(hidden, 'any').day.reason).toBe('noQualifiedStaff');
  });

  it('midnight boundaries: hours up to 23:59 keep the last start on the grid within the day', () => {
    const b = barber();
    const hours = { ...nineToFive, thu: [{ start: '00:00', end: '23:59' }] };
    const ctx = context({
      services: [cut],
      staff: [b],
      shopHours: hours,
      staffHours: new Map([[b._id, hours]]),
    });
    const times = hhmmList(oneDay(ctx, b.slug).day.slots.map((s) => s.startAt));
    expect(times[0]).toBe('00:00');
    expect(times.at(-1)).toBe('23:15');
    expect(times).toHaveLength(94);
  });
});

describe('availability: DST', () => {
  const b = barber();
  const ctx = context({
    services: [cut],
    staff: [b],
    staffHours: new Map([[b._id, nineToFive]]),
    now: new Date('2026-03-01T12:00:00Z'),
  });

  it('spring forward (2026-03-08): 9:00 is 13:00Z (EDT), day has the usual 31 slots', () => {
    const { day } = oneDay(
      {
        ...ctx,
        shopHours: { ...nineToFive, sun: nineToFive.mon },
        staffHours: new Map([[b._id, { ...nineToFive, sun: nineToFive.mon }]]),
      },
      b.slug,
      '2026-03-08',
    );
    expect(day.slots[0]?.startAt.toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(hhmmList(day.slots.map((s) => s.startAt))).toHaveLength(31);
    expect(hhmmList(day.slots.map((s) => s.startAt)).at(-1)).toBe('16:30');
  });

  it('fall back (2026-11-01): 9:00 is 14:00Z and slots stay on the local grid', () => {
    const fall = context({
      ...ctx,
      now: new Date('2026-10-25T12:00:00Z'),
      shopHours: { ...nineToFive, sun: [{ start: '00:30', end: '17:00' }] },
      staffHours: new Map([[b._id, { ...nineToFive, sun: [{ start: '00:30', end: '17:00' }] }]]),
    });
    const { day } = oneDay(fall, b.slug, '2026-11-01');
    const iso = day.slots.map((s) => s.startAt.toISOString());
    expect(iso).toContain('2026-11-01T05:30:00.000Z'); // 01:30 EDT
    expect(iso).toContain('2026-11-01T06:30:00.000Z'); // 01:30 EST (the repeated hour)
    expect(iso).toContain('2026-11-01T14:00:00.000Z'); // 09:00 EST
    expect(hhmmList(day.slots.map((s) => s.startAt)).at(-1)).toBe('16:30');
    expect(shopLocalToUtc('2026-11-01', '09:00').toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });
});

describe('availability: first available', () => {
  it('merges chairs, ranks the least booked first and keeps every candidate', () => {
    const a = barber({ sortOrder: 1, name: 'A' });
    const b = barber({ sortOrder: 2, name: 'B' });
    const ctx = context({
      services: [cut],
      staff: [a, b],
      staffHours: new Map([
        [a._id, nineToFive],
        [b._id, nineToFive],
      ]),
      bookings: [
        booking({ staffId: a._id, startAt: at(DATE, '14:00'), durationMinutes: 60 }),
        // Work on another day and cancelled work do not count toward today's fairness.
        booking({ staffId: b._id, startAt: at('2026-03-13', '09:00'), durationMinutes: 8 * 60 }),
        booking({
          staffId: b._id,
          startAt: at(DATE, '09:00'),
          status: 'cancelled',
          durationMinutes: 8 * 60,
        }),
      ],
    });
    const { day } = oneDay(ctx, 'any');
    const nine = day.slots.find((s) => s.startAt.getTime() === at(DATE, '09:00').getTime());
    expect(nine?.staffId).toBe(b._id); // A already has 60 minutes that day
    expect(nine?.candidates).toEqual([b._id, a._id]);
    const two = day.slots.find((s) => s.startAt.getTime() === at(DATE, '14:00').getTime());
    expect(two?.candidates).toEqual([b._id]);
    expect(day.byStaff).toHaveLength(2);
  });

  it('round robin alternates chairs across consecutive slots', () => {
    const a = barber({ sortOrder: 1 });
    const b = barber({ sortOrder: 2 });
    const ctx = context({
      services: [cut],
      staff: [a, b],
      staffHours: new Map([
        [a._id, nineToFive],
        [b._id, nineToFive],
      ]),
      settings: settings({ firstAvailableStrategy: 'roundRobin' }),
    });
    const picks = oneDay(ctx, 'any')
      .day.slots.slice(0, 4)
      .map((s) => s.staffId);
    expect(picks).toEqual([a._id, b._id, a._id, b._id]);
  });

  it('day reason summarises across chairs: dayOff only when everyone is off', () => {
    const a = barber();
    const b = barber();
    const ctx = context({
      services: [cut],
      staff: [a, b],
      staffHours: new Map([[a._id, nineToFive]]), // b has no hours
      bookings: [booking({ staffId: a._id, startAt: at(DATE, '09:00'), durationMinutes: 8 * 60 })],
    });
    expect(oneDay(ctx, 'any').day.reason).toBe('fullyBooked');
    const bothOff = context({ ...ctx, staffHours: new Map() });
    expect(oneDay(bothOff, 'any').day.reason).toBe('dayOff');
  });

  it('multi-day results, findSlot and nextOpenSlots', () => {
    const b = barber();
    const ctx = context({
      services: [cut],
      staff: [b],
      staffHours: new Map([[b._id, nineToFive]]),
    });
    const result = computeAvailability(
      { fromDate: '2026-03-14', toDate: '2026-03-16', staff: 'any' },
      ctx,
    );
    expect(result.days.map((d) => d.reason)).toEqual([null, 'closed', null]);
    expect(findSlot(result, at('2026-03-14', '09:00'))?.staffId).toBe(b._id);
    expect(findSlot(result, at('2026-03-14', '09:05'))).toBeNull();
    expect(findSlot(result, at('2026-03-15', '09:00'))).toBeNull();
    const next = nextOpenSlots(result, at('2026-03-14', '16:30'), 3);
    expect(next.map((s) => s.startAt)).toEqual([
      at('2026-03-14', '16:30'),
      at('2026-03-16', '09:00'),
      at('2026-03-16', '09:15'),
    ]);
    expect(nextOpenSlots(result, at('2026-03-17', '00:00'), 3)).toEqual([]);
  });
});

describe('availability: working time for the conflict rule', () => {
  const b = barber();
  const source = {
    shopHours: nineToFive,
    staffHours: new Map([[b._id, nineToFive]]),
    closures: [closure('2026-03-13')],
    timeBlocks: [
      block({
        staffId: b._id,
        kind: 'timeOff',
        startAt: at(DATE, '12:00'),
        endAt: at(DATE, '13:00'),
      }),
      block({
        staffId: b._id,
        kind: 'block',
        startAt: at(DATE, '15:00'),
        endAt: at(DATE, '15:30'),
      }),
    ],
  };

  it('workingRangesFor reports ranges, a closed shop and a chair that is off', () => {
    expect(workingRangesFor(b._id, DATE, source)).toEqual({
      ranges: [
        { start: at(DATE, '09:00'), end: at(DATE, '12:00') },
        { start: at(DATE, '13:00'), end: at(DATE, '17:00') },
      ],
      reason: null,
    });
    expect(workingRangesFor(b._id, '2026-03-13', source)).toEqual({ ranges: [], reason: 'closed' });
    expect(workingRangesFor('nobody', DATE, source)).toEqual({ ranges: [], reason: 'dayOff' });
  });

  it('isWithinWorkingTime needs a live chair, a range holding the services and no block', () => {
    const inside = { staffId: b._id, startAt: at(DATE, '10:00'), endAt: at(DATE, '10:30') };
    expect(isWithinWorkingTime(inside, b, source)).toBe(true);
    expect(isWithinWorkingTime(inside, undefined, source)).toBe(false);
    expect(isWithinWorkingTime(inside, { deletedAt: FIXTURE_NOW }, source)).toBe(false);
    const acrossLunch = { ...inside, startAt: at(DATE, '11:45'), endAt: at(DATE, '12:15') };
    expect(isWithinWorkingTime(acrossLunch, b, source)).toBe(false);
    const endsAtClose = { ...inside, startAt: at(DATE, '16:30'), endAt: at(DATE, '17:00') };
    expect(isWithinWorkingTime(endsAtClose, b, source)).toBe(true);
    const onBlock = { ...inside, startAt: at(DATE, '15:15'), endAt: at(DATE, '15:45') };
    expect(isWithinWorkingTime(onBlock, b, source)).toBe(false);
    const otherChairBlock = {
      ...source,
      timeBlocks: [
        block({
          staffId: 'other',
          kind: 'block',
          startAt: at(DATE, '10:00'),
          endAt: at(DATE, '11:00'),
        }),
      ],
    };
    expect(isWithinWorkingTime(inside, b, otherChairBlock)).toBe(true);
  });
});
