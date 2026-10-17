import type { PublicShop } from '@shared/api/public';
import { DAY_KEYS } from '@shared/lib/time';
import { DAY_NAMES } from './shop';

export const SITE_NAME = 'Exquisite Barber & Beauty Lounge';
export const SITE_DESCRIPTION =
  'Barbers and stylists under one roof in Brookhaven, PA. Gifted Hands. Pick your chair and book online in under a minute.';

/** The structured data for the shop as a schema.org BarberShop, built from the hours API. */
export function shopJsonLd(shop: PublicShop, origin: string): Record<string, unknown> {
  const street = shop.address.line2
    ? `${shop.address.line1}, ${shop.address.line2}`
    : shop.address.line1;
  return {
    '@context': 'https://schema.org',
    '@type': 'BarberShop',
    name: shop.name,
    slogan: shop.tagline,
    url: `${origin}/`,
    telephone: shop.phone,
    email: shop.email,
    image: `${origin}/og.png`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: street,
      addressLocality: shop.address.city,
      addressRegion: shop.address.state,
      postalCode: shop.address.postalCode,
      addressCountry: 'US',
    },
    sameAs: [`https://www.instagram.com/${shop.instagramHandle}`],
    openingHoursSpecification: DAY_KEYS.flatMap((day) =>
      shop.hours[day].map((range) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: DAY_NAMES[day],
        opens: range.start,
        closes: range.end,
      })),
    ),
  };
}
