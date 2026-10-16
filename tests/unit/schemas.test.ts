import { describe, expect, it } from 'vitest';
import { availabilityQuerySchema } from '../../shared/api/availability';
import { createBookingRequestSchema } from '../../shared/api/bookings';
import { closureInputSchema } from '../../shared/schemas/closure';
import { idSchema, timeIntervalSchema, weekHoursSchema } from '../../shared/schemas/common';
import { bookingSettingsSchema } from '../../shared/schemas/shopSettings';
import { weeklyHoursDocumentSchema } from '../../shared/schemas/weeklyHours';

const id = '64a1f2c3d4e5f60718293a4b';

describe('shared schemas', () => {
  it('ids are 24 hex characters', () => {
    expect(idSchema.safeParse(id).success).toBe(true);
    expect(idSchema.safeParse('ABC').success).toBe(false);
  });

  it('intervals must end after they start', () => {
    expect(timeIntervalSchema.safeParse({ start: '09:00', end: '17:00' }).success).toBe(true);
    expect(timeIntervalSchema.safeParse({ start: '17:00', end: '09:00' }).success).toBe(false);
    expect(timeIntervalSchema.safeParse({ start: '9:00', end: '17:00' }).success).toBe(false);
  });

  it('week hours need all seven days', () => {
    expect(weekHoursSchema.safeParse({ mon: [], tue: [] }).success).toBe(false);
  });

  it('booking settings apply defaults and enforce the lock granularity', () => {
    const parsed = bookingSettingsSchema.parse({});
    expect(parsed.slotStepMinutes).toBe(15);
    expect(parsed.leadTimeMinutes).toBe(60);
    expect(parsed.bookingWindowDays).toBe(30);
    expect(bookingSettingsSchema.safeParse({ slotStepMinutes: 20 }).success).toBe(false);
    expect(bookingSettingsSchema.safeParse({ slotStepMinutes: 30 }).success).toBe(true);
  });

  it('closures: closed days have no intervals, special hours need one', () => {
    expect(
      closureInputSchema.safeParse({ date: '2026-12-25', kind: 'closed', label: 'Christmas' })
        .success,
    ).toBe(true);
    expect(
      closureInputSchema.safeParse({ date: '2026-12-24', kind: 'specialHours', label: 'Eve' })
        .success,
    ).toBe(false);
    expect(
      closureInputSchema.safeParse({
        date: '2026-12-24',
        kind: 'specialHours',
        intervals: [{ start: '09:00', end: '13:00' }],
        label: 'Eve',
      }).success,
    ).toBe(true);
  });

  it('weekly hours tie subject type to staffId', () => {
    const days = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    expect(
      weeklyHoursDocumentSchema.safeParse({
        _id: id,
        subjectType: 'shop',
        staffId: id,
        days,
        updatedAt: new Date(),
      }).success,
    ).toBe(false);
    expect(
      weeklyHoursDocumentSchema.safeParse({
        _id: id,
        subjectType: 'staff',
        staffId: null,
        days,
        updatedAt: new Date(),
      }).success,
    ).toBe(false);
  });

  it('availability query splits service ids and defaults staff to any', () => {
    const parsed = availabilityQuerySchema.parse({ date: '2026-03-10', serviceIds: `${id},${id}` });
    expect(parsed.serviceIds).toHaveLength(2);
    expect(parsed.staff).toBe('any');
    expect(
      availabilityQuerySchema.safeParse({ date: '2026-03-10', serviceIds: 'nope' }).success,
    ).toBe(false);
  });

  it('create booking request normalizes the customer phone and email', () => {
    const parsed = createBookingRequestSchema.parse({
      serviceIds: [id],
      staff: 'any',
      startAt: '2026-03-10T14:00:00-04:00',
      customer: { name: 'Sam', phone: '(215) 555-0123', email: 'Sam@Example.com' },
    });
    expect(parsed.customer.phone).toBe('+12155550123');
    expect(parsed.customer.email).toBe('sam@example.com');
  });
});
