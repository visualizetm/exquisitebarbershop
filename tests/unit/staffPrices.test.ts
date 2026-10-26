import { describe, expect, it } from 'vitest';
import { staffCreateRequestSchema, staffUpdateRequestSchema } from '../../shared/api/admin';
import { publicStaffSchema } from '../../shared/api/public';
import { servicePricesSchema, staffInputSchema } from '../../shared/schemas/staff';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);

function staffBody(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'drew',
    name: 'Drew',
    role: 'barber',
    title: 'Barber',
    specialty: '',
    bio: '',
    chairNumber: 3,
    serviceIds: [A, B],
    photoUrl: null,
    instagramHandle: null,
    sortOrder: 20,
    acceptsOnlineBooking: true,
    showOnWebsite: true,
    ...overrides,
  };
}

describe('servicePrices schema', () => {
  it('accepts a price with and without a time, and an empty list', () => {
    expect(
      servicePricesSchema.safeParse([
        { serviceId: A, priceCents: 5000, durationMinutes: 75 },
        { serviceId: B, priceCents: 0 },
      ]).success,
    ).toBe(true);
    expect(servicePricesSchema.safeParse([]).success).toBe(true);
  });

  it('is optional on the staff input, so old records and old clients still validate', () => {
    expect(staffInputSchema.safeParse(staffBody()).success).toBe(true);
    expect(staffInputSchema.parse(staffBody()).servicePrices).toBeUndefined();
  });

  it('refuses a negative price, a price with a fraction of a cent and a price that is not a number', () => {
    for (const priceCents of [-1, 12.5, '4000', null, Number.NaN]) {
      expect(servicePricesSchema.safeParse([{ serviceId: A, priceCents }]).success).toBe(false);
    }
  });

  it('refuses a time that is not a multiple of five between five minutes and eight hours', () => {
    for (const durationMinutes of [0, 3, 47, 485, -5, 7.5]) {
      expect(
        servicePricesSchema.safeParse([{ serviceId: A, priceCents: 100, durationMinutes }]).success,
      ).toBe(false);
    }
    expect(
      servicePricesSchema.safeParse([{ serviceId: A, priceCents: 100, durationMinutes: 480 }])
        .success,
    ).toBe(true);
  });

  it('refuses a service id that is not an id, and two entries for one service', () => {
    expect(servicePricesSchema.safeParse([{ serviceId: 'haircut', priceCents: 100 }]).success).toBe(
      false,
    );
    const twice = servicePricesSchema.safeParse([
      { serviceId: A, priceCents: 100 },
      { serviceId: A, priceCents: 200 },
    ]);
    expect(twice.success).toBe(false);
    expect(twice.error?.issues[0]?.message).toBe('Only one price per service');
    expect(twice.error?.issues[0]?.path).toEqual([1, 'serviceId']);
  });

  it('refuses a very long list', () => {
    const many = Array.from({ length: 101 }, (_, i) => ({
      serviceId: i.toString(16).padStart(24, '0'),
      priceCents: 100,
    }));
    expect(servicePricesSchema.safeParse(many).success).toBe(false);
  });
});

describe('staff create and update requests', () => {
  it('create refuses a price for a service the person does not offer', () => {
    const result = staffCreateRequestSchema.safeParse(
      staffBody({ servicePrices: [{ serviceId: C, priceCents: 100 }] }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['servicePrices', 0, 'serviceId']);
    expect(result.error?.issues[0]?.message).toBe('This person does not offer that service');
  });

  it('create accepts prices for services on the menu', () => {
    expect(
      staffCreateRequestSchema.safeParse(
        staffBody({ servicePrices: [{ serviceId: B, priceCents: 100 }] }),
      ).success,
    ).toBe(true);
  });

  it('update checks the two halves against each other only when it carries both', () => {
    expect(
      staffUpdateRequestSchema.safeParse({
        serviceIds: [A],
        servicePrices: [{ serviceId: B, priceCents: 100 }],
      }).success,
    ).toBe(false);
    // Prices alone are checked against the stored menu by the service, not here.
    expect(
      staffUpdateRequestSchema.safeParse({ servicePrices: [{ serviceId: B, priceCents: 100 }] })
        .success,
    ).toBe(true);
    expect(staffUpdateRequestSchema.safeParse({ name: 'Drew' }).success).toBe(true);
  });
});

describe('public staff payload', () => {
  it('carries the prices and defaults to none for a response from before the field', () => {
    const base = {
      id: A,
      slug: 'drew',
      name: 'Drew',
      role: 'barber',
      title: 'Barber',
      specialty: '',
      bio: '',
      chairNumber: 3,
      serviceIds: [B],
      photoUrl: null,
      instagramHandle: null,
      acceptsOnlineBooking: true,
      sortOrder: 20,
    };
    expect(publicStaffSchema.parse(base).servicePrices).toEqual([]);
    expect(
      publicStaffSchema.parse({ ...base, servicePrices: [{ serviceId: B, priceCents: 2500 }] })
        .servicePrices,
    ).toEqual([{ serviceId: B, priceCents: 2500 }]);
  });
});
