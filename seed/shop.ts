/**
 * Placeholder shop data. Every value marked PLACEHOLDER must be confirmed with the
 * client before launch. This is the only file that holds guessed values.
 *
 * Ids are deterministic (seedId) so running the seed twice never duplicates rows.
 */
import { seedId } from '../server/lib/ids';
import type { WeekHours } from '../shared/schemas/common';
import type { ServiceInput } from '../shared/schemas/service';
import type { ShopSettingsInput } from '../shared/schemas/shopSettings';
import type { StaffInput } from '../shared/schemas/staff';

export const shopSettingsSeed: ShopSettingsInput = {
  name: 'Exquisite Barber & Beauty Lounge',
  tagline: 'Gifted Hands',
  address: {
    line1: '3309 Edgmont Ave',
    line2: null,
    city: 'Brookhaven',
    state: 'PA',
    postalCode: '19015', // PLACEHOLDER confirm ZIP
  },
  phone: '(610) 555-0100', // PLACEHOLDER
  email: 'hello@exquisitebarberbeauty.com', // PLACEHOLDER
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
  // PLACEHOLDER the owner edits this in prompt 11; until then the strip says this
  announcement: {
    enabled: true,
    text: 'Walk ins welcome',
    linkLabel: 'Book online',
    linkUrl: '/book',
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

// PLACEHOLDER shop hours
export const shopHoursSeed: WeekHours = {
  mon: closed,
  tue: [{ start: '09:00', end: '19:00' }],
  wed: [{ start: '09:00', end: '19:00' }],
  thu: [{ start: '09:00', end: '19:00' }],
  fri: [{ start: '09:00', end: '19:00' }],
  sat: [{ start: '08:00', end: '17:00' }],
  sun: closed,
};

export interface ServiceSeed {
  key: string;
  input: ServiceInput;
}

// PLACEHOLDER every service name, price and duration
export const servicesSeed: ServiceSeed[] = [
  {
    key: 'classic-cut',
    input: {
      name: 'Classic Cut',
      group: 'Barber',
      description: 'Clipper or scissor cut with a clean lineup.',
      priceCents: 3000,
      priceFrom: false,
      durationMinutes: 30,
      sortOrder: 10,
      isActive: true,
    },
  },
  {
    key: 'skin-fade',
    input: {
      name: 'Skin Fade',
      group: 'Barber',
      description: 'Fade down to the skin, blended and lined.',
      priceCents: 3500,
      priceFrom: false,
      durationMinutes: 45,
      sortOrder: 20,
      isActive: true,
    },
  },
  {
    key: 'cut-and-beard',
    input: {
      name: 'Cut and Beard',
      group: 'Barber',
      description: 'Haircut plus a shaped and lined beard.',
      priceCents: 4500,
      priceFrom: false,
      durationMinutes: 45,
      sortOrder: 30,
      isActive: true,
    },
  },
  {
    key: 'beard-trim',
    input: {
      name: 'Beard Trim and Lineup',
      group: 'Barber',
      description: 'Shape, trim and crisp edges.',
      priceCents: 2000,
      priceFrom: false,
      durationMinutes: 15,
      sortOrder: 40,
      isActive: true,
    },
  },
  {
    key: 'lineup',
    input: {
      name: 'Lineup',
      group: 'Barber',
      description: 'Edge up only.',
      priceCents: 1500,
      priceFrom: false,
      durationMinutes: 15,
      sortOrder: 50,
      isActive: true,
    },
  },
  {
    key: 'kids-cut',
    input: {
      name: 'Kids Cut',
      group: 'Barber',
      description: 'Ages 12 and under.',
      priceCents: 2500,
      priceFrom: false,
      durationMinutes: 30,
      sortOrder: 60,
      isActive: true,
    },
  },
  {
    key: 'hot-towel-shave',
    input: {
      name: 'Hot Towel Shave',
      group: 'Barber',
      description: 'Straight razor shave with hot towels.',
      priceCents: 3000,
      priceFrom: false,
      durationMinutes: 30,
      sortOrder: 70,
      isActive: true,
    },
  },
  {
    key: 'hair-design',
    input: {
      name: 'Hair Design',
      group: 'Barber',
      description: 'Custom parts and designs, priced by detail.',
      priceCents: 1000,
      priceFrom: true,
      durationMinutes: 15,
      sortOrder: 80,
      isActive: true,
    },
  },
  {
    key: 'silk-press',
    input: {
      name: 'Silk Press',
      group: 'Beauty',
      description: 'Wash, blow dry and silk press.',
      priceCents: 7500,
      priceFrom: true,
      durationMinutes: 90,
      sortOrder: 110,
      isActive: true,
    },
  },
  {
    key: 'wash-and-style',
    input: {
      name: 'Wash and Style',
      group: 'Beauty',
      description: 'Shampoo, condition and style.',
      priceCents: 5000,
      priceFrom: true,
      durationMinutes: 60,
      sortOrder: 120,
      isActive: true,
    },
  },
  {
    key: 'twist-out',
    input: {
      name: 'Natural Twist Out',
      group: 'Beauty',
      description: 'Defined twist out on natural hair.',
      priceCents: 6500,
      priceFrom: true,
      durationMinutes: 75,
      sortOrder: 130,
      isActive: true,
    },
  },
  {
    key: 'braids',
    input: {
      name: 'Braids',
      group: 'Beauty',
      description: 'Priced by style and length.',
      priceCents: 12000,
      priceFrom: true,
      durationMinutes: 180,
      bufferMinutes: 20, // PLACEHOLDER longer cleanup after braids
      sortOrder: 140,
      isActive: true,
    },
  },
  {
    key: 'locs-retwist',
    input: {
      name: 'Locs Retwist',
      group: 'Beauty',
      description: 'Retwist and style.',
      priceCents: 8500,
      priceFrom: true,
      durationMinutes: 120,
      sortOrder: 150,
      isActive: true,
    },
  },
];

export function serviceSeedId(key: string): string {
  return seedId('service', key);
}

export function staffSeedId(key: string): string {
  return seedId('staff', key);
}

const barberServiceKeys = [
  'classic-cut',
  'skin-fade',
  'cut-and-beard',
  'beard-trim',
  'lineup',
  'kids-cut',
  'hot-towel-shave',
  'hair-design',
];
const beautyServiceKeys = ['silk-press', 'wash-and-style', 'twist-out', 'braids', 'locs-retwist'];

export interface StaffSeed {
  key: string;
  input: StaffInput;
  hours: WeekHours;
}

// PLACEHOLDER every name except Dontrise, every title, specialty, bio, chair, service list and schedule
export const staffSeed: StaffSeed[] = [
  {
    key: 'dontrise',
    input: {
      slug: 'dontrise',
      name: 'Dontrise', // owner, confirmed
      role: 'owner',
      title: 'Owner and Master Barber', // PLACEHOLDER
      specialty: 'Fades, beards and natural hair', // PLACEHOLDER
      bio: 'Owner of Exquisite Barber & Beauty Lounge.', // PLACEHOLDER
      chairNumber: 1, // PLACEHOLDER
      serviceIds: [...barberServiceKeys, ...beautyServiceKeys].map(serviceSeedId), // PLACEHOLDER
      photoUrl: null,
      instagramHandle: 'exquisitebarberbeauty',
      sortOrder: 0,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    },
    hours: shopHoursSeed, // PLACEHOLDER
  },
  {
    key: 'marcus',
    input: {
      slug: 'marcus',
      name: 'Marcus', // PLACEHOLDER
      role: 'barber',
      title: 'Barber', // PLACEHOLDER
      specialty: 'Skin fades and designs', // PLACEHOLDER
      bio: '', // PLACEHOLDER
      chairNumber: 2, // PLACEHOLDER
      serviceIds: barberServiceKeys.map(serviceSeedId), // PLACEHOLDER
      photoUrl: null,
      instagramHandle: null, // PLACEHOLDER
      sortOrder: 10,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    },
    hours: { ...shopHoursSeed, sat: [{ start: '08:00', end: '14:00' }] }, // PLACEHOLDER
  },
  {
    key: 'dee',
    input: {
      slug: 'dee',
      name: 'Dee', // PLACEHOLDER
      role: 'barber',
      title: 'Barber', // PLACEHOLDER
      specialty: 'Classic cuts and hot towel shaves', // PLACEHOLDER
      bio: '', // PLACEHOLDER
      chairNumber: 3, // PLACEHOLDER
      serviceIds: barberServiceKeys.map(serviceSeedId), // PLACEHOLDER
      photoUrl: null,
      instagramHandle: null, // PLACEHOLDER
      sortOrder: 20,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    },
    hours: { ...shopHoursSeed, tue: closed }, // PLACEHOLDER
  },
  {
    key: 'tre',
    input: {
      slug: 'tre',
      name: 'Tre', // PLACEHOLDER
      role: 'barber',
      title: 'Barber', // PLACEHOLDER
      specialty: 'Kids cuts and beards', // PLACEHOLDER
      bio: '', // PLACEHOLDER
      chairNumber: 4, // PLACEHOLDER
      serviceIds: barberServiceKeys.map(serviceSeedId), // PLACEHOLDER
      photoUrl: null,
      instagramHandle: null, // PLACEHOLDER
      sortOrder: 30,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    },
    hours: { ...shopHoursSeed, wed: closed }, // PLACEHOLDER
  },
  {
    key: 'jay',
    input: {
      slug: 'jay',
      name: 'Jay', // PLACEHOLDER
      role: 'barber',
      title: 'Barber', // PLACEHOLDER
      specialty: 'Tapers and lineups', // PLACEHOLDER
      bio: '', // PLACEHOLDER
      chairNumber: 5, // PLACEHOLDER
      serviceIds: barberServiceKeys.map(serviceSeedId), // PLACEHOLDER
      photoUrl: null,
      instagramHandle: null, // PLACEHOLDER
      sortOrder: 40,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    },
    hours: { ...shopHoursSeed, thu: closed }, // PLACEHOLDER
  },
  {
    key: 'kris',
    input: {
      slug: 'kris',
      name: 'Kris', // PLACEHOLDER
      role: 'barber',
      title: 'Barber', // PLACEHOLDER
      specialty: 'Fades and hair designs', // PLACEHOLDER
      bio: '', // PLACEHOLDER
      chairNumber: 6, // PLACEHOLDER
      serviceIds: barberServiceKeys.map(serviceSeedId), // PLACEHOLDER
      photoUrl: null,
      instagramHandle: null, // PLACEHOLDER
      sortOrder: 50,
      acceptsOnlineBooking: true,
      showOnWebsite: true,
    },
    hours: { ...shopHoursSeed, fri: [{ start: '12:00', end: '19:00' }] }, // PLACEHOLDER
  },
];
