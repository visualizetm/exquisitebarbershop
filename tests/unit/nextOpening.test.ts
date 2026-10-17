import { describe, expect, it } from 'vitest';
import { openingLabel, serviceForChair } from '../../server/services/nextOpening';
import { shopLocalToUtc } from '../../shared/lib/time';
import type { ServiceDocument } from '../../shared/schemas/service';
import type { StaffDocument } from '../../shared/schemas/staff';

const now = shopLocalToUtc('2026-03-10', '09:00');

describe('openingLabel', () => {
  it('says the time today, Tomorrow for the next day, and the weekday after that', () => {
    expect(openingLabel(shopLocalToUtc('2026-03-10', '14:15'), now)).toBe('2:15 PM');
    expect(openingLabel(shopLocalToUtc('2026-03-11', '10:00'), now)).toBe('Tomorrow 10:00 AM');
    expect(openingLabel(shopLocalToUtc('2026-03-12', '10:00'), now)).toBe('Thu 10:00 AM');
  });
});

describe('serviceForChair', () => {
  const service = (id: string, minutes: number, sortOrder = 0) =>
    ({ _id: id, durationMinutes: minutes, sortOrder }) as ServiceDocument;
  const staff = { serviceIds: ['a', 'b'] } as StaffDocument;
  const services = [service('a', 30, 1), service('b', 15, 2), service('c', 5)];

  it("picks the shortest service the chair offers, or the owner's choice when offered", () => {
    expect(serviceForChair(staff, services, null)?._id).toBe('b');
    expect(serviceForChair(staff, services, 'a')?._id).toBe('a');
    expect(serviceForChair(staff, services, 'c')?._id).toBe('b');
    expect(
      serviceForChair({ serviceIds: [] } as unknown as StaffDocument, services, null),
    ).toBeNull();
  });
});
