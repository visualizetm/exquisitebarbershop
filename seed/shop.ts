/**
 * Shop data. The shop facts, the team and every service price below come from the shop's own pages
 * (Google Business Profile, Dontrise's Squire menu, Drew's and Nelly's theCut menus and Instagram),
 * collected on 2026-10-25 and kept in docs/content/exquisite-site-data.json. Dontrise confirms them
 * before the real launch. Whatever is still unknown is marked PLACEHOLDER and must be confirmed
 * with the client. This is the only file that holds shop values.
 *
 * Ids are deterministic (seedId) so running the seed twice never duplicates rows.
 */
import { newId, seedId } from '../server/lib/ids';
import type { WeekHours } from '../shared/schemas/common';
import type { ServiceInput } from '../shared/schemas/service';
import type { ReviewItem, ReviewSource, ShopSettingsInput } from '../shared/schemas/shopSettings';
import type { ServicePrice, StaffInput } from '../shared/schemas/staff';

/**
 * The shop's public email until the client has a real mailbox. While the stored email is still this
 * value, no public page and no calendar file shows it (server/lib/publicEmail.ts).
 */
export const PLACEHOLDER_SHOP_EMAIL = 'hello@exquisitebarberbeauty.com'; // PLACEHOLDER

/** A review as the seed holds it: `staffKey` names the chair it is about and becomes its id. */
export interface ReviewSeed {
  name: string;
  source: ReviewSource;
  stars: number;
  /** theCut shows no exact date, so its reviews have none. */
  date?: string;
  staffKey?: string;
  text: string;
}

/**
 * The reviews on the site, copied word for word from docs/content/exquisite-site-data.json
 * (`reviews_for_site`): every Google review there except Wesley T. (it calls Lee the owner), then
 * Drew's and Nelly's theCut reviews. Spelling is left as written and nothing is added. Lamont I. is
 * the short version. The Google reviews that name Dontrise are about his chair. Nelly's real name is
 * Mike, so two of his reviews say Mike. The first three are the ones Home shows. Dontrise confirms
 * the shop may use them before the real launch.
 */
export const reviewsSeed: ReviewSeed[] = [
  {
    name: 'Unique D.',
    source: 'google',
    stars: 5,
    date: '2025-11-25',
    text: 'Great environment been getting my haircut there for a while now and always feel welcomed when I come in for a haircut. The environment is very clean and the music is always good.',
  },
  {
    name: 'Ricardo E.',
    source: 'google',
    stars: 5,
    date: '2025-07-30',
    text: 'Great place! I walked in without an appointment and was helped right away. I loved the haircut, and the prices were very affordable. I’ll definitely be coming back!',
  },
  {
    name: 'Routine Life Fitness',
    source: 'google',
    stars: 5,
    date: '2024-09-24',
    staffKey: 'dontrise',
    text: '10/10!! This was my first time here and I will definitely be returning. Dontrise was professional, patient and very knowledgeable and communicative. My cut was super sharp!! One of the best cuts I’ve gotten in a min.',
  },
  {
    name: 'Daniel M.',
    source: 'google',
    stars: 5,
    date: '2024-10-26',
    staffKey: 'dontrise',
    text: 'First time customer, Dontrise cut my son’s hair(9yo). I have no complaints. He was thorough,professional and made sure he was cutting to my son and I’s liking multiple times. Clean shop. I’m not easily pleased but this was a good experience as a first time customer. They also offer wash and dry services also.',
  },
  {
    name: 'Lamont I.',
    source: 'google',
    stars: 5,
    date: '2024-10-24',
    staffKey: 'dontrise',
    text: 'Great barbershop. Dontrise is phenomenal barber. ... Patience and his attention to detail is everything. Great customer service.',
  },
  {
    name: 'Shamarr M.',
    source: 'google',
    stars: 5,
    date: '2025-09-14',
    text: 'Soon as I sat in the chair I felt at home this is officially my go to.',
  },
  {
    name: 'Basil S.',
    source: 'google',
    stars: 5,
    date: '2026-10-16',
    text: 'Amazing haircut’s the entire shop is sharp',
  },
  {
    name: 'Frankie',
    source: 'google',
    stars: 5,
    date: '2024-10-02',
    text: 'best barber around 10/10 cut and a got me in as soon as i walked in the door',
  },
  {
    name: 'Margaret A.',
    source: 'google',
    stars: 5,
    date: '2026-02-14',
    text: 'Love this place already!!!!',
  },
  {
    name: 'Tom R.',
    source: 'thecut',
    stars: 5,
    staffKey: 'drew',
    text: 'Attention to detail and communication skills already at an elite level stayed in constant dialogue every step of the cut. Sharpest I’ve been in years, definitely coming back',
  },
  {
    name: 'Alexis M.',
    source: 'thecut',
    stars: 5,
    staffKey: 'drew',
    text: 'It was our first time going to this barber, and my boys got some of the best haircuts they’ve had in a long time! They’re tender-headed, and the barber was very patient and gentle with them. We’ll definitely be back and highly recommend!',
  },
  {
    name: 'Mark G.',
    source: 'thecut',
    stars: 5,
    staffKey: 'drew',
    text: 'Drew has great communication, makes recommendations for your haircut but ultimately gives you exactly what you want. Will book again soon!',
  },
  {
    name: 'Jourdan S.',
    source: 'thecut',
    stars: 5,
    staffKey: 'drew',
    text: 'No cap Drew is one of the best barbers I have met. His attention to detail and the effort he puts into every single cut is unmatched.',
  },
  {
    name: 'Mike R.',
    source: 'thecut',
    stars: 5,
    staffKey: 'drew',
    text: 'Great atmosphere, great barber! Drew is very professional and considerate. Definitely will be going back',
  },
  {
    name: 'Paul H.',
    source: 'thecut',
    stars: 5,
    staffKey: 'nelly',
    text: 'Been getting haircuts by Mike since 2018 … he cuts me and my 4 year old routinely . Perfection everytime , I won’t let anybody else touch our heads',
  },
  {
    name: 'Christian T.',
    source: 'thecut',
    stars: 5,
    staffKey: 'nelly',
    text: 'I’ve been around the area for 4 years now. Buddy of mine suggested I go to Mike. I’m glad I listened because Mike has been my barber ever since. Hands down best barber I’ve had.',
  },
  {
    name: 'Dylan M.',
    source: 'thecut',
    stars: 5,
    staffKey: 'nelly',
    text: 'Nelly is reliable, and sharp. Definitely would recommend',
  },
  {
    name: 'Jesse W.',
    source: 'thecut',
    stars: 5,
    staffKey: 'nelly',
    text: 'Sharp cut, super quick and cool dude.',
  },
];

/** The stored reviews: a new id for each, the chair resolved from its key, all shown, in order. */
export function seedReviewItems(): ReviewItem[] {
  return reviewsSeed.map(({ staffKey, date, ...review }, index) => ({
    id: newId(),
    ...review,
    ...(date === undefined ? {} : { date }),
    staffId: staffKey ? staffSeedId(staffKey) : null,
    show: true,
    sortOrder: index * 10,
  }));
}

export const shopSettingsSeed: ShopSettingsInput = {
  name: 'Exquisite Barber & Beauty Lounge',
  tagline: 'Gifted Hands',
  // The top of the home page, editable on the Website side.
  hero: {
    headline: 'Gifted hands. Exquisite cuts.',
    redWord: 'Exquisite',
    subline: 'Barbers and stylists under one roof. Pick your chair and book in under a minute.',
  },
  visit: {
    parking: '', // PLACEHOLDER parking details from Dontrise
    goodToKnow: ['Kids welcome', 'Wheelchair accessible parking lot'],
  },
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
  // The ads promise $10 off a first online booking. The minimum price is a guess. // PLACEHOLDER
  launchOffer: {
    enabled: true,
    amountCents: 1000,
    minTotalCents: 2000,
    label: '$10 off your first online booking',
    startsOn: '',
    endsOn: '',
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
  reviews: { enabled: true, items: seedReviewItems() },
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

/**
 * Where a person charges more, or takes longer, than the shop's own price and time: [price in cents]
 * or [price in cents, minutes]. They come from the same menus as the prices above (Dontrise's Squire
 * menu, Drew's and Nelly's theCut menus). A service missing here uses the shop's price and time.
 */
const servicePriceKeysByStaff: Record<
  string,
  Record<string, readonly [priceCents: number] | readonly [priceCents: number, minutes: number]>
> = {
  dontrise: {
    haircut: [5000, 75],
    'cut-design': [7000],
    'kids-cut': [3000, 45],
    'kids-design': [4000, 90],
    lineup: [3000, 40],
    'color-cut': [10000, 180],
  },
  drew: { 'kids-cut': [2500] },
  nelly: { haircut: [4500] },
};

function servicePricesFor(staffKey: string): ServicePrice[] {
  return Object.entries(servicePriceKeysByStaff[staffKey] ?? {}).map(
    ([serviceKey, [price, minutes]]) => ({
      serviceId: serviceSeedId(serviceKey),
      priceCents: price,
      ...(minutes === undefined ? {} : { durationMinutes: minutes }),
    }),
  );
}

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
      servicePrices: servicePricesFor('dontrise'),
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
      servicePrices: servicePricesFor('lee'),
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
      servicePrices: servicePricesFor('drew'),
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
      servicePrices: servicePricesFor('nelly'),
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
      servicePrices: servicePricesFor('iniya'),
      photoUrl: null,
      instagramHandle: 'iniyathestylist',
      sortOrder: 40,
      acceptsOnlineBooking: false,
      showOnWebsite: true,
    },
    hours: noOnlineHours,
  },
];
