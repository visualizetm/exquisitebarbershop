import { z } from 'zod';
import { MAX_NOTE_LENGTH } from '../lib/constants';
import { PIN_PATTERN } from '../lib/pin';
import { bookingSourceSchema, bookingStatusSchema } from '../schemas/booking';
import { hhmmSchema, idSchema, isoDateSchema, phoneSchema } from '../schemas/common';
import { timeBlockViewSchema, workingDaySchema } from './admin';
import { photoViewSchema } from './photos';

export const pinSchema = z.string().regex(PIN_PATTERN, 'Use exactly 6 digits');

// ---------------------------------------------------------------------------
// Signing in, setting up
// ---------------------------------------------------------------------------

export const teamLoginRequestSchema = z.object({ staffId: idSchema, pin: pinSchema });
export type TeamLoginRequest = z.input<typeof teamLoginRequestSchema>;

/** What the setup page may show before the barber has chosen a PIN. */
export const teamSetupInfoResponseSchema = z.object({ staffName: z.string() });

export const teamSetupRequestSchema = z
  .object({ pin: pinSchema, confirmPin: pinSchema })
  .refine((v) => v.pin === v.confirmPin, {
    message: 'The two PINs do not match',
    path: ['confirmPin'],
  });
export type TeamSetupRequest = z.input<typeof teamSetupRequestSchema>;

export const teamChangePinRequestSchema = z
  .object({ currentPin: pinSchema, newPin: pinSchema, confirmPin: pinSchema })
  .refine((v) => v.newPin === v.confirmPin, {
    message: 'The two PINs do not match',
    path: ['confirmPin'],
  });
export type TeamChangePinRequest = z.input<typeof teamChangePinRequestSchema>;

export const teamMeResponseSchema = z.object({
  staff: z.object({
    id: idSchema,
    name: z.string(),
    title: z.string(),
    photo: photoViewSchema.nullable(),
    chairNumber: z.int().nullable(),
    bio: z.string(),
    instagramHandle: z.string().nullable(),
  }),
  /** When this sign-in ends, whatever the barber does. */
  expiresAt: z.iso.datetime(),
});
export type TeamMeResponse = z.infer<typeof teamMeResponseSchema>;

// ---------------------------------------------------------------------------
// The barber's own days
// ---------------------------------------------------------------------------

/**
 * A booking as a barber sees it: the client's name and the work, never a phone number or an
 * email. "Call shop" is the way to reach a client.
 */
export const teamBookingViewSchema = z.object({
  id: idSchema,
  referenceCode: z.string(),
  status: bookingStatusSchema,
  source: bookingSourceSchema,
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  customerName: z.string(),
  services: z.array(z.string()),
  notes: z.string().nullable(),
  priceCents: z.int().min(0),
  arrivedAt: z.iso.datetime().nullable(),
  startedAt: z.iso.datetime().nullable(),
});
export type TeamBookingView = z.infer<typeof teamBookingViewSchema>;

export const teamDayResponseSchema = z.object({
  date: isoDateSchema,
  now: z.iso.datetime(),
  working: workingDaySchema,
  /** The first confirmed booking that has not ended yet today. */
  nextUp: teamBookingViewSchema.nullable(),
  bookings: z.array(teamBookingViewSchema),
  blocks: z.array(timeBlockViewSchema),
  /** The barber marked themselves out for today. */
  isOut: z.boolean(),
  counts: z.object({ total: z.int(), done: z.int(), noShow: z.int(), left: z.int() }),
});
export type TeamDayResponse = z.infer<typeof teamDayResponseSchema>;

export const teamWeekResponseSchema = z.object({
  days: z.array(
    z.object({
      date: isoDateSchema,
      working: workingDaySchema,
      count: z.int(),
      bookings: z.array(teamBookingViewSchema),
      blocks: z.array(timeBlockViewSchema),
    }),
  ),
});
export type TeamWeekResponse = z.infer<typeof teamWeekResponseSchema>;

export const teamStatusRequestSchema = z.object({
  status: z.enum(['completed', 'noShow', 'confirmed']),
});
export const teamStatusResponseSchema = z.object({ booking: teamBookingViewSchema });

export const teamNoteRequestSchema = z.object({
  notes: z.string().trim().max(MAX_NOTE_LENGTH).nullable(),
});

export const teamWalkInRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: phoneSchema,
  serviceIds: z.array(idSchema).min(1).max(6),
});
export type TeamWalkInRequest = z.input<typeof teamWalkInRequestSchema>;
export const teamWalkInResponseSchema = z.object({
  booking: teamBookingViewSchema,
  outsideWorkingTime: z.boolean(),
});

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

export const teamTimeOffResponseSchema = z.object({
  isOutToday: z.boolean(),
  blocks: z.array(timeBlockViewSchema),
  requests: z.array(
    z.object({
      id: idSchema,
      fromDate: isoDateSchema,
      toDate: isoDateSchema,
      reason: z.string().nullable(),
    }),
  ),
});
export type TeamTimeOffResponse = z.infer<typeof teamTimeOffResponseSchema>;

export const teamBlockTimeRequestSchema = z
  .object({
    date: isoDateSchema,
    start: hhmmSchema,
    end: hhmmSchema,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.end > v.start, { message: 'The end must be after the start', path: ['end'] });
export type TeamBlockTimeRequest = z.input<typeof teamBlockTimeRequestSchema>;

export const teamOutTodayResponseSchema = z.object({
  /** Confirmed clients today whose bookings stay in place until the owner decides. */
  clients: z.int(),
});

export const teamDaysOffRequestSchema = z
  .object({
    fromDate: isoDateSchema,
    toDate: isoDateSchema,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.toDate >= v.fromDate, {
    message: 'The last day cannot be before the first',
    path: ['toDate'],
  });
export type TeamDaysOffRequest = z.input<typeof teamDaysOffRequestSchema>;
export const teamDaysOffResponseSchema = z.object({
  /** True when the days were empty and the time off is already in place. */
  applied: z.boolean(),
  /** Clients on those days when it became a request for the owner. */
  clients: z.int(),
});

// ---------------------------------------------------------------------------
// The owner's side: a barber's access
// ---------------------------------------------------------------------------

export const staffAccessResponseSchema = z.object({
  hasPin: z.boolean(),
  lastSignInAt: z.iso.datetime().nullable(),
  /** Set while five wrong tries have locked the barber out. */
  lockedUntil: z.iso.datetime().nullable(),
  /** A setup link was made and has neither been used nor expired. */
  setupLinkActive: z.boolean(),
});
export type StaffAccessResponse = z.infer<typeof staffAccessResponseSchema>;

export const setupLinkResponseSchema = z.object({
  /** The full address to send the barber. Shown once; only its hash is kept. */
  url: z.string(),
  expiresAt: z.iso.datetime(),
});
export type SetupLinkResponse = z.infer<typeof setupLinkResponseSchema>;
