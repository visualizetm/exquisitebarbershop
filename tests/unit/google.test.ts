import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_SHOP_EMAIL, isPlaceholderEmail, publicEmail } from '../../shared/lib/email';
import { googleMapsUrl, googleReviewUrl } from '../../shared/lib/google';
import { DEFAULT_GOOGLE, googleSettingsSchema } from '../../shared/schemas/shopSettings';
import { shopSettingsSeed } from '../../seed/shop';
import { addressLine, directionsUrl } from '../../src/lib/shop';

const PLACE_ID = 'ChIJISdW6zTpxokRzSBEJjMQU4M';

describe('Google links', () => {
  it('builds the Maps link from the place id and the shop name', () => {
    expect(googleMapsUrl(PLACE_ID)).toBe(
      'https://www.google.com/maps/search/?api=1&query=Exquisite%20Barber%20%26%20Beauty%20Lounge&query_place_id=ChIJISdW6zTpxokRzSBEJjMQU4M',
    );
    expect(googleMapsUrl(PLACE_ID, 'Other Shop')).toContain('query=Other%20Shop&');
  });

  it('builds the leave-a-review link from the place id', () => {
    expect(googleReviewUrl(PLACE_ID)).toBe(
      'https://search.google.com/local/writereview?placeid=ChIJISdW6zTpxokRzSBEJjMQU4M',
    );
  });

  it('keeps an unexpected character in a place id from escaping the query string', () => {
    expect(googleReviewUrl('a&b=c')).toBe(
      'https://search.google.com/local/writereview?placeid=a%26b%3Dc',
    );
  });

  it('Directions uses the Maps link when a place id is set, else a search for the address', () => {
    const shop = {
      name: 'Exquisite Barber & Beauty Lounge',
      address: {
        line1: '3309 Edgmont Ave',
        line2: 'Suite F',
        city: 'Brookhaven',
        state: 'PA',
        postalCode: '19015',
      },
    };
    expect(directionsUrl({ ...shop, google: shopSettingsSeed.google ?? DEFAULT_GOOGLE })).toBe(
      googleMapsUrl(PLACE_ID),
    );
    const fallback = directionsUrl({ ...shop, google: DEFAULT_GOOGLE });
    expect(fallback).toContain('query=3309%20Edgmont%20Ave%2C%20Suite%20F%2C%20Brookhaven');
    expect(fallback).not.toContain('query_place_id');
    expect(directionsUrl(shop)).toBe(fallback);
  });
});

describe('addressLine', () => {
  const address = {
    line1: '3309 Edgmont Ave',
    line2: 'Suite F' as string | null,
    city: 'Brookhaven',
    state: 'PA',
    postalCode: '19015',
  };

  it('puts the suite between the street and the town, for the calendar file and the page text', () => {
    expect(addressLine(address)).toBe('3309 Edgmont Ave, Suite F, Brookhaven, PA 19015');
  });

  it('leaves the suite out when there is none', () => {
    expect(addressLine({ ...address, line2: null })).toBe('3309 Edgmont Ave, Brookhaven, PA 19015');
  });
});

describe('google settings', () => {
  it('accepts the shop values from the seed', () => {
    expect(googleSettingsSchema.parse(shopSettingsSeed.google)).toEqual({
      placeId: PLACE_ID,
      rating: 4.7,
      reviewCount: 15,
      ratingCheckedOn: '2026-10-25',
    });
  });

  it('accepts "not set yet": no place id, no rating, no date', () => {
    expect(googleSettingsSchema.parse(DEFAULT_GOOGLE)).toEqual(DEFAULT_GOOGLE);
  });

  it('rejects a rating outside 0 to 5, more than one decimal, and a count that is not a whole number', () => {
    const base = { placeId: PLACE_ID, rating: 4.7, reviewCount: 15, ratingCheckedOn: '2026-10-25' };
    expect(googleSettingsSchema.safeParse({ ...base, rating: 5.1 }).success).toBe(false);
    expect(googleSettingsSchema.safeParse({ ...base, rating: -1 }).success).toBe(false);
    expect(googleSettingsSchema.safeParse({ ...base, rating: 4.75 }).success).toBe(false);
    expect(googleSettingsSchema.safeParse({ ...base, reviewCount: 1.5 }).success).toBe(false);
    expect(googleSettingsSchema.safeParse({ ...base, reviewCount: -2 }).success).toBe(false);
  });

  it('rejects a count without a rating, a bad date and a place id with odd characters', () => {
    const base = { placeId: PLACE_ID, rating: 4.7, reviewCount: 15, ratingCheckedOn: '2026-10-25' };
    expect(googleSettingsSchema.safeParse({ ...base, rating: 0 }).success).toBe(false);
    expect(googleSettingsSchema.safeParse({ ...base, ratingCheckedOn: '25/10/2026' }).success).toBe(
      false,
    );
    expect(googleSettingsSchema.safeParse({ ...base, placeId: 'abc def' }).success).toBe(false);
    expect(googleSettingsSchema.safeParse({ ...base, placeId: 'a'.repeat(201) }).success).toBe(
      false,
    );
  });
});

describe('the stand-in shop email', () => {
  it('is hidden while it is the placeholder, in any letter case', () => {
    expect(isPlaceholderEmail(PLACEHOLDER_SHOP_EMAIL)).toBe(true);
    expect(isPlaceholderEmail(' Hello@ExquisiteBarberBeauty.com ')).toBe(true);
    expect(isPlaceholderEmail('')).toBe(true);
    expect(isPlaceholderEmail(null)).toBe(true);
    expect(publicEmail(PLACEHOLDER_SHOP_EMAIL)).toBe('');
  });

  it('shows once the owner sets a real address', () => {
    expect(isPlaceholderEmail('chair@realshop.com')).toBe(false);
    expect(publicEmail(' chair@realshop.com ')).toBe('chair@realshop.com');
  });

  it('the seed email is the placeholder, so a fresh install shows none', () => {
    expect(isPlaceholderEmail(shopSettingsSeed.email)).toBe(true);
  });
});
