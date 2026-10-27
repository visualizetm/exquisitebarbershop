import { z } from 'zod';
import { LOCK_GRANULARITY_MINUTES, SHOP_SETTINGS_ID } from '../lib/constants';
import {
  emailSchema,
  idSchema,
  isoDateSchema,
  nonEmptyText,
  phoneSchema,
  timestampsSchema,
} from './common';

export const addressSchema = z.object({
  line1: nonEmptyText(120),
  line2: nonEmptyText(120).nullable(),
  city: nonEmptyText(80),
  state: z.string().length(2),
  postalCode: z.string().regex(/^\d{5}(?:-\d{4})?$/),
});

export const firstAvailableStrategySchema = z.enum(['leastBookedThatDay', 'roundRobin']);

/** Every configurable booking rule, with its default. The availability engine reads these. */
export const bookingSettingsSchema = z.object({
  /** Customer-facing start time step. Must be a multiple of the lock granularity. */
  slotStepMinutes: z
    .int()
    .min(LOCK_GRANULARITY_MINUTES)
    .max(120)
    .multipleOf(LOCK_GRANULARITY_MINUTES)
    .default(15),
  /** Gap reserved after each booking. Locked with the booking. A service may override it. */
  bufferMinutes: z.int().min(0).max(60).multipleOf(5).default(10),
  /** How far in the future a slot must be before it can be booked online. */
  leadTimeMinutes: z
    .int()
    .min(0)
    .max(7 * 24 * 60)
    .default(60),
  /** How many days ahead customers may book. */
  bookingWindowDays: z.int().min(1).max(365).default(30),
  /** Customers cannot cancel online closer than this to the start. */
  cancelCutoffMinutes: z
    .int()
    .min(0)
    .max(7 * 24 * 60)
    .default(120),
  /** Customers cannot reschedule online closer than this to the start. */
  rescheduleCutoffMinutes: z
    .int()
    .min(0)
    .max(7 * 24 * 60)
    .default(120),
  maxServicesPerBooking: z.int().min(1).max(6).default(3),
  allowFirstAvailable: z.boolean().default(true),
  firstAvailableStrategy: firstAvailableStrategySchema.default('leastBookedThatDay'),
  requireEmail: z.boolean().default(false),
  /** Abuse guard: open bookings a single phone number may hold at once. */
  maxOpenBookingsPerPhone: z.int().min(1).max(20).default(3),
});
export type BookingSettings = z.infer<typeof bookingSettingsSchema>;

export const notificationSettingsSchema = z.object({
  ownerAlertEmail: emailSchema,
  fromName: nonEmptyText(80),
  replyToEmail: emailSchema.nullable(),
  customerConfirmationEmail: z.boolean().default(true),
  ownerNewBookingEmail: z.boolean().default(true),
  /** Reserved for the SMS channel. Off until the SMS provider is wired in. */
  customerSms: z.boolean().default(false),
});

/** What barber logins may do on their own. */
export const staffPermissionsSchema = z.object({
  /** Barbers may block their own time (lunch, time off). Off by default. */
  barbersCanBlockTime: z.boolean().default(false),
  /** Barbers may upload photos to their own chair. Off by default. */
  barbersCanUploadPhotos: z.boolean().default(false),
});
export type StaffPermissions = z.infer<typeof staffPermissionsSchema>;
export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = {
  barbersCanBlockTime: false,
  barbersCanUploadPhotos: false,
};

/** Feature flags for work that is designed but not built. All default off. */
export const featureFlagsSchema = z.object({
  giftCards: z.boolean().default(false),
  rewards: z.boolean().default(false),
  smsReminders: z.boolean().default(false),
});

/** A rating is a whole or half-step number from 1 to 5 with at most one decimal, or 0 for "none yet". */
const ratingSchema = z
  .number()
  .min(0)
  .max(5)
  .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, {
    message: 'Use at most one decimal, for example 4.7',
  });

/**
 * The shop's Google Business Profile. The place id builds the Directions, "Read them on Google" and
 * "Leave a review" links. The rating, count and date are copied by hand from the profile (Google
 * offers no free feed) and the owner edits them in Website, Reviews. Empty or zero means "not set".
 */
const googleRatingFields = {
  rating: ratingSchema,
  reviewCount: z.int().min(0).max(100_000),
  /** The shop date the rating was last read from Google, or empty. */
  ratingCheckedOn: z.union([z.literal(''), isoDateSchema]),
};
const ratingNeedsCount = (g: { rating: number; reviewCount: number }) =>
  g.reviewCount === 0 || g.rating >= 1;
const ratingNeedsCountIssue = {
  path: ['rating'],
  message: 'Add the rating, or set the review count to 0',
};

export const googleSettingsSchema = z
  .object({
    placeId: z
      .string()
      .trim()
      .max(200)
      .regex(/^[A-Za-z0-9_-]*$/, 'A place id has only letters, digits, hyphens and underscores'),
    ...googleRatingFields,
  })
  .refine(ratingNeedsCount, ratingNeedsCountIssue);
export type GoogleSettings = z.infer<typeof googleSettingsSchema>;

/**
 * The part of the Google block the owner copies by hand: the rating, the count and the date. Strict,
 * so a save that tries to change the place id (the Directions and review links) is refused.
 */
export const googleRatingSchema = z
  .strictObject(googleRatingFields)
  .refine(ratingNeedsCount, ratingNeedsCountIssue);
export type GoogleRating = z.infer<typeof googleRatingSchema>;
export const DEFAULT_GOOGLE: GoogleSettings = {
  placeId: '',
  rating: 0,
  reviewCount: 0,
  ratingCheckedOn: '',
};

export const REVIEW_SOURCES = ['google', 'thecut'] as const;
export const reviewSourceSchema = z.enum(REVIEW_SOURCES);
export type ReviewSource = z.infer<typeof reviewSourceSchema>;
/** How many reviews the shop keeps, and the longest review text, in characters. */
export const MAX_REVIEWS = 30;
export const REVIEW_TEXT_MAX = 600;

/**
 * One real review, copied word for word from Google or theCut (no spelling fixed, nothing added).
 * Reviews come from the seed only: the owner shows, hides and orders them, but never types one, so
 * every quote on the site stays real. `staffId` is the chair the review is about, if it names one.
 */
export const reviewItemSchema = z.object({
  id: idSchema,
  /** First name and last initial, as the reviewer shows it. */
  name: nonEmptyText(80),
  text: nonEmptyText(REVIEW_TEXT_MAX),
  stars: z.int().min(1).max(5),
  source: reviewSourceSchema,
  /** The day it was posted (shop date). theCut shows no exact date, so its reviews have none. */
  date: isoDateSchema.optional(),
  staffId: idSchema.nullable(),
  show: z.boolean(),
  sortOrder: z.int().min(0).max(10_000),
});
export type ReviewItem = z.infer<typeof reviewItemSchema>;

/** The reviews on Home and the chair pages. Off hides every review on the site. */
export const reviewsSettingsSchema = z
  .object({
    enabled: z.boolean(),
    items: z.array(reviewItemSchema).max(MAX_REVIEWS),
  })
  .refine((r) => new Set(r.items.map((i) => i.id)).size === r.items.length, {
    path: ['items'],
    message: 'Each review needs its own id',
  });
export type ReviewsSettings = z.infer<typeof reviewsSettingsSchema>;
export const DEFAULT_REVIEWS: ReviewsSettings = { enabled: true, items: [] };

/** A link target: a path on this site or an https address. */
const announcementLinkSchema = z
  .string()
  .trim()
  .max(200)
  .refine(
    (v) => v === '' || (v.startsWith('/') && !v.startsWith('//')) || v.startsWith('https://'),
    {
      message: 'Use a path such as /book or an https address',
    },
  );

/** The line in the thin ink strip above the header. The link is optional (leave both parts empty). */
export const announcementSchema = z
  .object({
    enabled: z.boolean(),
    text: z.string().trim().max(90),
    linkLabel: z.string().trim().max(30),
    linkUrl: announcementLinkSchema,
    /** The last day the strip shows (shop date), or empty to keep it until it is switched off. */
    endsOn: z.union([z.literal(''), isoDateSchema]).default(''),
  })
  .refine((a) => !a.enabled || a.text.length > 0, {
    path: ['text'],
    message: 'Add the announcement text, or switch it off',
  })
  .refine((a) => (a.linkLabel === '') === (a.linkUrl === ''), {
    path: ['linkUrl'],
    message: 'Give the link both a label and an address, or leave both empty',
  });
export type Announcement = z.infer<typeof announcementSchema>;
export const DEFAULT_ANNOUNCEMENT: Announcement = {
  enabled: true,
  text: 'Walk-ins welcome',
  linkLabel: 'Book online',
  linkUrl: '/book',
  endsOn: '',
};

/** Whether the strip should show on a shop date: switched on and not past its end date. */
export function announcementIsLive(a: Announcement, today: string): boolean {
  return a.enabled && (a.endsOn === '' || today <= a.endsOn);
}

/** A link to one of the shop's own pages on a social network: https, on that network's host. */
function socialUrl(domain: string, label: string) {
  return z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => {
        if (v === '') return true;
        try {
          const url = new URL(v);
          return (
            url.protocol === 'https:' &&
            (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
          );
        } catch {
          return false;
        }
      },
      { message: `Use the full https address of the ${label} page, or leave it empty` },
    );
}

/** Empty means "not set": the footer shows an icon only for a link that is set. */
export const socialLinksSchema = z.object({
  instagramUrl: socialUrl('instagram.com', 'Instagram'),
  tiktokUrl: socialUrl('tiktok.com', 'TikTok'),
  facebookUrl: socialUrl('facebook.com', 'Facebook'),
});
export type SocialLinks = z.infer<typeof socialLinksSchema>;
export const DEFAULT_SOCIAL_LINKS: SocialLinks = {
  instagramUrl: '',
  tiktokUrl: '',
  facebookUrl: '',
};

/**
 * The top of the home page. The headline is at most 48 characters and the red word must appear in
 * it, so the public hero can always paint one word red. The seed carries today's copy.
 */
export const heroSchema = z
  .object({
    headline: nonEmptyText(48),
    redWord: nonEmptyText(24),
    subline: nonEmptyText(160),
  })
  .refine((v) => v.headline.split(/\s+/).some((w) => w.replace(/[.,!?]+$/, '') === v.redWord), {
    message: 'The red word must be one of the words in the headline',
    path: ['redWord'],
  });
export type HeroCopy = z.infer<typeof heroSchema>;
export const DEFAULT_HERO: HeroCopy = {
  headline: 'Gifted hands. Exquisite cuts.',
  redWord: 'Exquisite',
  subline: 'Barbers and stylists under one roof. Pick your chair and book in under a minute.',
};

/** The Visit page's own words: parking, and the "Good to know" lines. */
export const visitSchema = z.object({
  parking: z.string().trim().max(300).default(''),
  goodToKnow: z.array(nonEmptyText(80)).max(6).default([]),
});
export type VisitCopy = z.infer<typeof visitSchema>;
export const DEFAULT_VISIT: VisitCopy = {
  parking: '',
  goodToKnow: ['Kids welcome', 'Wheelchair accessible parking lot'],
};

export const shopSettingsDocumentSchema = z
  .object({
    _id: z.literal(SHOP_SETTINGS_ID),
    name: nonEmptyText(120),
    tagline: nonEmptyText(120),
    address: addressSchema,
    phone: phoneSchema,
    email: emailSchema,
    instagramHandle: z.string().regex(/^[A-Za-z0-9._]{1,30}$/),
    websiteUrl: z.url().nullable(),
    timezone: z.literal('America/New_York'),
    booking: bookingSettingsSchema,
    notifications: notificationSettingsSchema,
    features: featureFlagsSchema,
    permissions: staffPermissionsSchema.default(DEFAULT_STAFF_PERMISSIONS),
    announcement: announcementSchema.default(DEFAULT_ANNOUNCEMENT),
    social: socialLinksSchema.default(DEFAULT_SOCIAL_LINKS),
    google: googleSettingsSchema.default(DEFAULT_GOOGLE),
    reviews: reviewsSettingsSchema.default(DEFAULT_REVIEWS),
    /** The service "next open" times are computed for. Null means each chair's shortest service. */
    nextOpenServiceId: idSchema.nullable().default(null),
    hero: heroSchema.default(DEFAULT_HERO),
    visit: visitSchema.default(DEFAULT_VISIT),
  })
  .extend(timestampsSchema.shape);
export type ShopSettingsDocument = z.infer<typeof shopSettingsDocumentSchema>;

/** Owner-editable fields. Everything except id and timestamps. */
export const shopSettingsInputSchema = shopSettingsDocumentSchema.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
});
export type ShopSettingsInput = z.input<typeof shopSettingsInputSchema>;

/**
 * What a settings save may carry. The reviews and the Google block are not part of it at all:
 * Website, Reviews saves both through its own route (`PUT /api/admin/reviews`), which can only show,
 * hide and order the reviews and set the rating, count and checked date; the place id is fixed by
 * the seed. A settings save that carries them (every panel sends back the settings it loaded) has
 * them stripped, so a tab opened earlier can neither change a quote nor undo a newer rating saved
 * in another tab.
 */
export const shopSettingsUpdateSchema = shopSettingsInputSchema.omit({
  reviews: true,
  google: true,
});
export type ShopSettingsUpdate = z.input<typeof shopSettingsUpdateSchema>;
