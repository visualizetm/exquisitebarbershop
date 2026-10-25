import { describe, expect, it } from 'vitest';
import type { PublicShop } from '../../shared/api/public';
import { chairDescription, shopJsonLd } from '../../src/lib/seo';

const shop: PublicShop = {
  name: 'Exquisite Barber & Beauty Lounge',
  tagline: 'Gifted Hands',
  address: {
    line1: '3309 Edgmont Ave',
    line2: 'Suite F',
    city: 'Brookhaven',
    state: 'PA',
    postalCode: '19015',
  },
  phone: '+16106090786',
  email: '',
  instagramHandle: 'exquisitebarberbeauty',
  timezone: 'America/New_York',
  hours: {
    mon: [],
    tue: [{ start: '10:00', end: '19:00' }],
    wed: [],
    thu: [],
    fri: [],
    sat: [
      { start: '10:00', end: '13:00' },
      { start: '14:00', end: '19:00' },
    ],
    sun: [{ start: '10:00', end: '19:00' }],
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
    expect(data.telephone).toBe('+16106090786');
    expect(data.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: '3309 Edgmont Ave, Suite F',
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
        opens: '10:00',
        closes: '19:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '10:00',
        closes: '13:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '14:00',
        closes: '19:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Sunday',
        opens: '10:00',
        closes: '19:00',
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
    const plain = shopJsonLd(
      { ...shop, address: { ...shop.address, line2: null } },
      'https://example.com',
    );
    expect((plain.address as { streetAddress: string }).streetAddress).toBe('3309 Edgmont Ave');
  });

  it('uses the Instagram URL from the social links, and adds the other pages that are set', () => {
    const data = shopJsonLd(
      {
        ...shop,
        social: {
          instagramUrl: 'https://instagram.com/exquisitebarberbeauty',
          tiktokUrl: '',
          facebookUrl: 'https://facebook.com/exquisite',
        },
      },
      'https://example.com',
    );
    expect(data.sameAs).toEqual([
      'https://instagram.com/exquisitebarberbeauty',
      'https://facebook.com/exquisite',
    ]);
  });

  it('leaves the email out while the shop has none, and prints it once it is set', () => {
    expect('email' in shopJsonLd(shop, 'https://example.com')).toBe(false);
    const data = shopJsonLd({ ...shop, email: 'chair@example.com' }, 'https://example.com');
    expect(data.email).toBe('chair@example.com');
  });

  it('carries no review markup: the rating on the page is copied by hand, so it is not structured', () => {
    const data = shopJsonLd(
      {
        ...shop,
        google: {
          placeId: 'ChIJISdW6zTpxokRzSBEJjMQU4M',
          rating: 4.7,
          reviewCount: 15,
          ratingCheckedOn: '2026-10-25',
        },
      },
      'https://example.com',
    );
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|ratingValue|reviewCount|"review"/);
  });

  it('never carries the owner personal number', () => {
    expect(JSON.stringify(shopJsonLd(shop, 'https://example.com'))).not.toContain('5609806');
  });
});

describe('chairDescription', () => {
  const member = {
    name: 'Drew',
    title: 'Barber, known as 2Sharp',
    specialty: 'Designs, color and perms',
    acceptsOnlineBooking: true,
    instagramHandle: 'drew2sharp' as string | null,
  };

  it('invites a chair that books online to see the next openings', () => {
    expect(chairDescription(member)).toBe(
      'Drew, Barber, known as 2Sharp at Exquisite Barber & Beauty Lounge in Brookhaven, PA. Designs, color and perms. See the next openings and book online.',
    );
  });

  it('does not promise openings for a chair that books through Instagram', () => {
    const text = chairDescription({
      ...member,
      name: 'Iniya',
      title: 'Braider',
      specialty: 'Braids and wigs',
      acceptsOnlineBooking: false,
      instagramHandle: 'iniyathestylist',
    });
    expect(text).toBe(
      'Iniya, Braider at Exquisite Barber & Beauty Lounge in Brookhaven, PA. Braids and wigs. Book through Instagram.',
    );
    expect(text).not.toMatch(/openings|book online/);
  });

  it('says walk-ins only for a chair with no online booking and no Instagram', () => {
    expect(
      chairDescription({ ...member, acceptsOnlineBooking: false, instagramHandle: null }),
    ).toMatch(/Walk-ins only\.$/);
  });
});
