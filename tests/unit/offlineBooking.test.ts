import { describe, expect, it } from 'vitest';
import type { PublicStaff } from '../../shared/api/public';
import { offlineBooking } from '../../src/lib/offlineBooking';

function member(overrides: Partial<PublicStaff>): PublicStaff {
  return {
    id: '64a1f2c3d4e5f60718293a4b',
    slug: 'lee',
    name: 'Lee',
    role: 'barber',
    title: 'Barber',
    specialty: 'Precision cuts',
    bio: '',
    chairNumber: 2,
    serviceIds: ['64a1f2c3d4e5f60718293a4c'],
    photoUrl: null,
    instagramHandle: 'lee_dabarber_',
    acceptsOnlineBooking: true,
    sortOrder: 10,
    ...overrides,
  };
}

describe('offlineBooking', () => {
  it('is null for a chair that takes online bookings', () => {
    expect(offlineBooking(member({}))).toBeNull();
  });

  it('sends a chair without online booking to the barber Instagram profile', () => {
    expect(
      offlineBooking(member({ acceptsOnlineBooking: false, instagramHandle: 'iniyathestylist' })),
    ).toEqual({
      label: 'Book through Instagram',
      href: 'https://instagram.com/iniyathestylist',
    });
  });

  it('says walk-ins only, with no link, when there is no Instagram to send people to', () => {
    expect(offlineBooking(member({ acceptsOnlineBooking: false, instagramHandle: null }))).toEqual({
      label: 'Walk-ins only',
      href: null,
    });
  });
});
