import { z } from 'zod';
import { LOCK_GRANULARITY_MINUTES, SHOP_SETTINGS_ID } from '../lib/constants';
import { emailSchema, nonEmptyText, phoneSchema, timestampsSchema } from './common';

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

/** Feature flags for work that is designed but not built. All default off. */
export const featureFlagsSchema = z.object({
  giftCards: z.boolean().default(false),
  rewards: z.boolean().default(false),
  smsReminders: z.boolean().default(false),
});

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
