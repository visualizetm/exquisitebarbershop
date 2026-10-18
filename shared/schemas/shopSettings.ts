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
  text: 'Walk ins welcome',
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
    /** The service "next open" times are computed for. Null means each chair's shortest service. */
    nextOpenServiceId: idSchema.nullable().default(null),
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
