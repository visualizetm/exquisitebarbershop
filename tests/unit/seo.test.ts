import { describe, expect, it } from 'vitest';
import type { PublicShop } from '../../shared/api/public';
import { shopJsonLd } from '../../src/lib/seo';

const shop: PublicShop = {
  name: 'Exquisite Barber & Beauty Lounge',
  tagline: 'Gifted Hands',
  address: {
    line1: '3309 Edgmont Ave',
    line2: null,
    city: 'Brookhaven',
    state: 'PA',
    postalCode: '19015',
  },
  phone: '+16105550100',
  email: 'hello@example.com',
  instagramHandle: 'exquisitebarberbeauty',
  timezone: 'America/New_York',
  hours: {
    mon: [],
    tue: [{ start: '09:00', end: '19:00' }],
    wed: [],
    thu: [],
    fri: [],
    sat: [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
    sun: [],
  },
  booking: {
    slotStepMinutes: 15,
    leadTimeMinutes: 60,
    bookingWindowDays: 30,
    maxServicesPerBooking: 3,
    allowFirstAvailable: true,
    requireEmail: false,
    cancelCutoffMinutes: 120,
  },
  heroPhoto: null,
};

describe('shopJsonLd', () => {
  it('describes the shop as a BarberShop with one opening spec per open range', () => {
    const data = shopJsonLd(shop, 'https://example.com');
    expect(data['@type']).toBe('BarberShop');
    expect(data.url).toBe('https://example.com/');
    expect(data.image).toBe('https://example.com/og.png');
    expect(data.telephone).toBe('+16105550100');
    expect(data.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: '3309 Edgmont Ave',
      addressLocality: 'Brookhaven',
      addressRegion: 'PA',
      postalCode: '19015',
      addressCountry: 'US',
    });
    expect(data.sameAs).toEqual(['https://www.instagram.com/exquisitebarberbeauty']);
    expect(data.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Tuesday',
        opens: '09:00',
        closes: '19:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '08:00',
        closes: '12:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '13:00',
        closes: '17:00',
      },
    ]);
  });

  it('joins a second address line into the street address', () => {
    const data = shopJsonLd(
      { ...shop, address: { ...shop.address, line2: 'Suite 2' } },
      'https://example.com',
    );
    expect((data.address as { streetAddress: string }).streetAddress).toBe(
      '3309 Edgmont Ave, Suite 2',
    );
  });
});
