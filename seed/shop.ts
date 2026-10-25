/**
 * Shop data. The shop facts, the team and every service price below come from the shop's own pages
 * (Google Business Profile, Dontrise's Squire menu, Drew's and Nelly's theCut menus and Instagram),
 * collected on 2026-10-25 and kept in docs/content/exquisite-site-data.json. Dontrise confirms them
 * before the real launch. Whatever is still unknown is marked PLACEHOLDER and must be confirmed
 * with the client. This is the only file that holds shop values.
 *
 * Ids are deterministic (seedId) so running the seed twice never duplicates rows.
 */
import { seedId } from '../server/lib/ids';
import { PLACEHOLDER_SHOP_EMAIL } from '../shared/lib/email';
import type { WeekHours } from '../shared/schemas/common';
import type { ServiceInput } from '../shared/schemas/service';
import type { ShopSettingsInput } from '../shared/schemas/shopSettings';
import type { StaffInput } from '../shared/schemas/staff';

export const shopSettingsSeed: ShopSettingsInput = {
  name: 'Exquisite Barber & Beauty Lounge',
  tagline: 'Gifted Hands',
  // Suite F is on Google and on Drew's booking page. Squire says "Unit 4". Suite F wins until
  // Dontrise says otherwise.
  address: {
    line1: '3309 Edgmont Ave',
    line2: 'Suite F',
    city: 'Brookhaven',
    state: 'PA',
    postalCode: '19015',
  },
  // The Google Business Profile number. Dontrise's personal text line is never published.
  phone: '(610) 609-0786',
  email: PLACEHOLDER_SHOP_EMAIL, // PLACEHOLDER hidden on every public page while it is this value
  instagramHandle: 'exquisitebarberbeauty',
  websiteUrl: null, // PLACEHOLDER final domain
  timezone: 'America/New_York',
  booking: {
    slotStepMinutes: 15,
    bufferMinutes: 10, // PLACEHOLDER cleanup gap after every appointment
    leadTimeMinutes: 60, // PLACEHOLDER
    bookingWindowDays: 30, // PLACEHOLDER
    cancelCutoffMinutes: 120, // PLACEHOLDER
    rescheduleCutoffMinutes: 120, // PLACEHOLDER
    maxServicesPerBooking: 3,
    allowFirstAvailable: true,
    firstAvailableStrategy: 'leastBookedThatDay',
    requireEmail: false,
    maxOpenBookingsPerPhone: 3,
  },
  notifications: {
    ownerAlertEmail: 'owner@exquisitebarberbeauty.com', // PLACEHOLDER
    fromName: 'Exquisite Barber & Beauty Lounge',
    replyToEmail: null, // PLACEHOLDER
    customerConfirmationEmail: true,
    ownerNewBookingEmail: true,
    customerSms: false,
  },
  features: {
    giftCards: false,
    rewards: false,
    smsReminders: false,
  },
  announcement: {
    enabled: true,
    text: 'Walk-ins welcome',
    linkLabel: 'Book online',
    linkUrl: '/book',
    endsOn: '',
  },
  // TikTok and Facebook pages do not exist, so the footer shows only Instagram.
  social: {
    instagramUrl: 'https://instagram.com/exquisitebarberbeauty',
    tiktokUrl: '',
    facebookUrl: '',
  },
  // Read from the Google Business Profile on 2026-10-25. The owner edits the rating and count in
  // Website, Reviews; Google offers no free feed, so they are copied by hand.
  google: {
    placeId: 'ChIJISdW6zTpxokRzSBEJjMQU4M',
    rating: 4.7,
    reviewCount: 15,
    ratingCheckedOn: '2026-10-25',
  },
};

/**
 * The owner login the seed creates when SEED_OWNER_PASSWORD is set. The password
 * itself never lives in the repository; SEED_OWNER_EMAIL overrides the address.
 */
export const ownerLoginSeed = {
  email: 'owner@exquisitebarberbeauty.com', // PLACEHOLDER
  staffKey: 'dontrise',
};

const closed: WeekHours[keyof WeekHours] = [];
const openDay: WeekHours[keyof WeekHours] = [{ start: '10:00', end: '19:00' }];

// Google Business Profile hours: closed Monday, 10 AM to 7 PM Tuesday to Sunday. Editable in the
// dashboard. Instagram posts hint at other walk-in days, so Dontrise confirms them.
export const shopHoursSeed: WeekHours = {
  mon: closed,
  tue: openDay,
  wed: openDay,
  thu: openDay,
  fri: openDay,
  sat: openDay,
  sun: openDay,
};

/** No online hours at all: used for a person who takes bookings somewhere else. */
const noOnlineHours: WeekHours = {
  mon: closed,
  tue: closed,
  wed: closed,
  thu: closed,
  fri: closed,
  sat: closed,
  sun: closed,
};

export interface ServiceSeed {
  key: string;
  input: ServiceInput;
}

function service(
  order: number,
  key: string,
  name: string,
  priceCents: number,
  priceFrom: boolean,
  durationMinutes: number,
  description: string,
  group: ServiceInput['group'] = 'Barber',
): ServiceSeed {
  return {
    key,
    input: {
      name,
      group,
      description,
      priceCents,
      priceFrom,
      durationMinutes,
      sortOrder: order * 10,
      isActive: true,
    },
  };
}

/**
 * Every price here is real. It comes from Dontrise's Squire menu or from Drew's and Nelly's theCut
 * menus, and Dontrise confirms the list before the real launch. A barber who charges a different
 * price or time for the same service gets a per barber override (staff.servicePrices); the price
 * and time here are the shop's own, shown as "from" when a service has a from flag.
 * Braids are Iniya's and have no public price, so there is no braids service.
 */
export const servicesSeed: ServiceSeed[] = [
  service(
    1,
    'haircut',
    'Haircut',
    4000,
    true,
    45,
    'Full haircut and lineup with a straight razor finish.',
  ),
  service(
    2,
    'cut-beard',
    'Haircut and Beard',
    4500,
    false,
    45,
    'Haircut plus beard trim and beard lineup.',
  ),
  service(
    3,
    'cut-design',
    'Haircut with Design',
    5000,
    true,
    60,
    'Full haircut with a design of your choice.',
  ),
  service(4, 'kids-cut', 'Kids Cut', 2000, true, 30, '12 and under.'),
  service(
    5,
    'kids-design',
    'Kids Cut with Design',
    4000,
    false,
    60,
    '12 and under, with a design.',
  ),
  service(6, 'lineup', 'Lineup', 2000, true, 20, 'Temple, forehead and neck. No cut, no fade.'),
  service(
    7,
    'hot-towel',
    'Hot Towel and Steam',
    2000,
    false,
    15,
    'Hot towel and steam to open the pores, then a cleanse and moisturizer. Add it to a cut.',
  ),
  service(
    8,
    'steam-fade',
    'Steam, Hot Towel and Fade',
    6000,
    false,
    60,
    'A sharp fade finished with hot towel and steam.',
  ),
  service(
    9,
    'big-chop',
    'Big Chop',
    5000,
    false,
    75,
    'For big changes where a lot of length comes off.',
  ),
  service(
    10,
    'color-cut',
    'Color and Cut',
    6500,
    true,
    90,
    'Permanent color with a full haircut. Dontrise asks for a $25 deposit before color.',
  ),
  service(
    11,
    'perm-cut',
    'Perm with Cut',
    15000,
    false,
    150,
    'Full perm set, kit included, finished with a haircut.',
  ),
  service(12, 'eyebrows', 'Eyebrows', 1000, false, 15, 'A quick trim and shape.'),
  // No description on Dontrise's menu, so none is invented.
  service(13, 'female-cut', 'Female Haircut', 4500, false, 75, '', 'Beauty'),
  service(14, 'father-son', 'Father and Son', 7000, false, 105, 'Two cuts, booked together.'),
  service(15, 'friends-cut', 'Friends Cut', 11000, false, 130, 'Two people coming in together.'),
];

export function serviceSeedId(key: string): string {
  return seedId('service', key);
}

export function staffSeedId(key: string): string {
  return seedId('staff', key);
}

/** Which services each person offers, by service key. */
const serviceKeysByStaff = {
  dontrise: [
    'haircut',
    'cut-design',
    'kids-cut',
    'kids-design',
    'lineup',
    'color-cut',
    'female-cut',
    'father-son',
    'friends-cut',
  ],
  // PLACEHOLDER Lee has no public menu, so he is given the services the shop prices.
  lee: ['haircut', 'cut-beard', 'cut-design', 'kids-cut', 'lineup'],
  drew: [
    'haircut',
    'cut-beard',
    'cut-design',
    'kids-cut',
    'lineup',
    'hot-towel',
    'big-chop',
    'color-cut',
    'perm-cut',
    'eyebrows',
  ],
  nelly: ['haircut', 'kids-cut', 'steam-fade'],
  // Iniya takes bookings on Instagram, so nothing is bookable on this site.
  iniya: [] as string[],
};

export interface StaffSeed {
  key: string;
  input: StaffInput;
  hours: WeekHours;
}

/**
 * The owner and four more. Chair numbers are not known yet, so the chairs are numbered 1 to 5 in
 * this order (PLACEHOLDER). Iniya is shown on the website but takes no online bookings: her card
 * and page send people to her Instagram.
 */
export const staffSeed: StaffSeed[] = [
  {
    key: 'dontrise',
    input: {
      slug: 'dontrise',
      name: 'Dontrise',
      role: 'owner',
      title: 'Owner and Barber',
      specialty: 'Fades, designs and color',
      bio: 'Team barber for the New York Jets and a travel barber. Hair Unit and AKN certified.',
      chairNumber: 1, // PLACEHOLDER
      serviceIds: serviceKeysByStaff.dontrise.map(serviceSeedId),
      photoUrl: null,
      instagramHandle: 'dontrisethebarber',
      sortOrder: 0,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    },
    hours: shopHoursSeed, // PLACEHOLDER
  },
  {
    key: 'lee',
    input: {
      slug: 'lee',
      name: 'Lee',
      role: 'barber',
      title: 'Barber',
      specialty: 'Precision cuts',
      bio: '', // PLACEHOLDER no public profile text was found
      chairNumber: 2, // PLACEHOLDER
      serviceIds: serviceKeysByStaff.lee.map(serviceSeedId), // PLACEHOLDER
      photoUrl: null,
      instagramHandle: 'lee_dabarber_',
      sortOrder: 10,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    },
    hours: shopHoursSeed, // PLACEHOLDER
  },
  {
    key: 'drew',
    input: {
      slug: 'drew',
      name: 'Drew',
      role: 'barber',
      title: 'Barber, known as 2Sharp',
      specialty: 'Designs, color and perms',
      bio: 'PA licensed barber and certified sensory safe. Works with all hair types: designs, color, perms, big chops and hairline restoration.',
      chairNumber: 3, // PLACEHOLDER
      serviceIds: serviceKeysByStaff.drew.map(serviceSeedId),
      photoUrl: null,
      instagramHandle: 'drew2sharp',
      sortOrder: 20,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    },
    // Drew's own theCut schedule: Tuesday to Saturday, 10:00 to 18:00.
    hours: {
      ...noOnlineHours,
      tue: [{ start: '10:00', end: '18:00' }],
      wed: [{ start: '10:00', end: '18:00' }],
      thu: [{ start: '10:00', end: '18:00' }],
      fri: [{ start: '10:00', end: '18:00' }],
      sat: [{ start: '10:00', end: '18:00' }],
    },
  },
  {
    key: 'nelly',
    input: {
      slug: 'nelly',
      name: 'Nelly Cutz',
      role: 'barber',
      title: 'Barber',
      specialty: 'Fades and tapers',
      bio: 'Delaware County barber. Ask for the steam, hot towel and fade.',
      chairNumber: 4, // PLACEHOLDER
      serviceIds: serviceKeysByStaff.nelly.map(serviceSeedId),
      photoUrl: null,
      instagramHandle: 'nellycutz_',
      sortOrder: 30,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    },
    hours: shopHoursSeed, // PLACEHOLDER
  },
  {
    key: 'iniya',
    input: {
      slug: 'iniya',
      name: 'Iniya',
      role: 'stylist',
      title: 'Braider',
      specialty: 'Braids and wigs',
      bio: 'Braiding since 2020. Book through Instagram for now.',
      chairNumber: 5, // PLACEHOLDER
      serviceIds: serviceKeysByStaff.iniya,
      photoUrl: null,
      instagramHandle: 'iniyathestylist',
      sortOrder: 40,
      acceptsOnlineBooking: false,
      showOnWebsite: true,
    },
    hours: noOnlineHours,
  },
];
