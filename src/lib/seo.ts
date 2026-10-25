import type { PublicShop } from '@shared/api/public';
import { DAY_KEYS } from '@shared/lib/time';
import { DAY_NAMES } from './shop';

export const SITE_NAME = 'Exquisite Barber & Beauty Lounge';
export const SITE_DESCRIPTION =
  'Barbers and stylists under one roof in Brookhaven, PA. Gifted Hands. Pick your chair and book online in under a minute.';

/** The pages the shop runs on social networks, for sameAs. Instagram always, the others when set. */
function sameAsLinks(shop: PublicShop): string[] {
  const instagram = shop.social?.instagramUrl;
  const links = [
    instagram !== undefined && instagram !== ''
      ? instagram
      : `https://www.instagram.com/${shop.instagramHandle}`,
    shop.social?.tiktokUrl,
    shop.social?.facebookUrl,
  ];
  return links.filter((link): link is string => Boolean(link));
}

/**
 * The structured data for the shop as a schema.org BarberShop, built from the shop API: the phone,
 * the address with its suite, the opening hours and the social pages. There is deliberately no
 * aggregateRating: Google ignores self-served review markup for a local business, and the rating
 * shown on the page is copied by hand from the Business Profile. The email is left out while the
 * shop has none (the API sends an empty string for the stand-in address).
 */
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
    ...(shop.email ? { email: shop.email } : {}),
    image: `${origin}/og.png`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: street,
      addressLocality: shop.address.city,
      addressRegion: shop.address.state,
      postalCode: shop.address.postalCode,
      addressCountry: 'US',
    },
    sameAs: sameAsLinks(shop),
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
