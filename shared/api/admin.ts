import { z } from 'zod';
import { MAX_NOTE_LENGTH } from '../lib/constants';
import {
  bookingCustomerSchema,
  bookingSourceSchema,
  bookingStatusSchema,
} from '../schemas/booking';
import { closureInputSchema } from '../schemas/closure';
import {
  hhmmSchema,
  idSchema,
  isoDateSchema,
  weekHoursSchema,
  slugSchema,
} from '../schemas/common';
import { outboxStatusSchema } from '../schemas/emailOutbox';
import { serviceInputSchema, serviceUpdateSchema } from '../schemas/service';
import { shopSettingsInputSchema } from '../schemas/shopSettings';
import { staffInputSchema, staffUpdateSchema } from '../schemas/staff';
import { actorTypeSchema, timeBlockKindSchema } from '../schemas/timeBlock';
import { staffSelectorSchema } from './availability';
import { bookingViewSchema } from './bookings';
import { photoViewSchema } from './photos';
import { alertKindSchema } from '../schemas/alert';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/**
 * The owner's choice for one booking a schedule change would leave outside
 * working time: keep it as an exception, move it to another chair at the same
 * time, or cancel it with or without telling the customer. Barbers may only keep.
 */
export const conflictActionSchema = z.enum(['keep', 'move', 'cancel', 'cancelAndNotify']);
export type ConflictAction = z.infer<typeof conflictActionSchema>;
export const conflictResolutionSchema = z
  .object({
    bookingId: idSchema,
    action: conflictActionSchema,
    /** For "move": the chair that takes the booking at the same time. */
    toStaffId: idSchema.optional(),
  })
  .refine((v) => (v.action === 'move') === (v.toStaffId !== undefined), {
    message: 'Moving a booking needs a chair, and only a move has one',
    path: ['toStaffId'],
  });
export type ConflictResolution = z.infer<typeof conflictResolutionSchema>;
export const resolutionsSchema = z.array(conflictResolutionSchema).max(500).optional();

/** Reported by every change that went through the conflict rule. */
export const conflictOutcomeSchema = z.object({
  kept: z.array(idSchema),
  cancelled: z.array(idSchema),
  moved: z.array(idSchema).default([]),
});
export type ConflictOutcome = z.infer<typeof conflictOutcomeSchema>;

export const adminBookingViewSchema = bookingViewSchema.extend({
  /** An online booking the owner has not opened yet. */
  isNew: z.boolean(),
  bufferMinutes: z.int(),
  cancellation: z
    .object({ at: z.iso.datetime(), by: actorTypeSchema, reason: z.string().nullable() })
    .nullable(),
  rescheduledFromId: idSchema.nullable(),
  ownerSeenAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type AdminBookingView = z.infer<typeof adminBookingViewSchema>;

export const timeBlockViewSchema = z.object({
  id: idSchema,
  staffId: idSchema,
  kind: timeBlockKindSchema,
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  reason: z.string().nullable(),
  createdBy: actorTypeSchema,
  createdAt: z.iso.datetime(),
});
export type TimeBlockView = z.infer<typeof timeBlockViewSchema>;

export const rangeViewSchema = z.object({ startAt: z.iso.datetime(), endAt: z.iso.datetime() });
export const staffRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  chairNumber: z.int().nullable(),
});
export type StaffRef = z.infer<typeof staffRefSchema>;

export const workingDaySchema = z.object({
  ranges: z.array(rangeViewSchema),
  reason: z.enum(['closed', 'dayOff']).nullable(),
});

// ---------------------------------------------------------------------------
// Today, schedule, who is in
// ---------------------------------------------------------------------------

export const whoIsInEntrySchema = z.object({
  staff: staffRefSchema,
  status: z.enum(['in', 'out', 'closed']),
  working: workingDaySchema,
  /** The owner toggled this person out for the day. */
  dayOff: z.boolean(),
  /** The owner added hours on top of the weekly schedule. */
  extraHours: z.boolean(),
});
export type WhoIsInEntry = z.infer<typeof whoIsInEntrySchema>;

export const dateQuerySchema = z.object({ date: isoDateSchema.optional() });

export const todayResponseSchema = z.object({
  date: isoDateSchema,
  now: z.iso.datetime(),
  counts: z.object({
    total: z.int(),
    confirmed: z.int(),
    completed: z.int(),
    noShow: z.int(),
    cancelled: z.int(),
    /** Online bookings, any day, the owner has not opened yet. */
    newOnline: z.int(),
  }),
  chairsBooked: z.int(),
  chairsWorking: z.int(),
  expectedRevenueCents: z.int(),
  completedRevenueCents: z.int(),
  nextUp: z.array(z.object({ staff: staffRefSchema, booking: adminBookingViewSchema.nullable() })),
  whoIsIn: z.array(whoIsInEntrySchema),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;

export const scheduleQuerySchema = z.object({
  date: isoDateSchema.optional(),
  staffId: idSchema.optional(),
});
export const scheduleChairSchema = z.object({
  staff: staffRefSchema,
  working: workingDaySchema,
  bookings: z.array(adminBookingViewSchema),
  blocks: z.array(timeBlockViewSchema),
});
export const scheduleResponseSchema = z.object({
  date: isoDateSchema,
  chairs: z.array(scheduleChairSchema),
});
export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>;

/** The week at a glance: chairs as rows, days as columns, bookings counted per cell. */
export const scheduleWeekResponseSchema = z.object({
  days: z.array(z.object({ date: isoDateSchema, label: z.string(), today: z.boolean() })),
  rows: z.array(
    z.object({
      staff: staffRefSchema,
      cells: z.array(
        z.object({
          date: isoDateSchema,
          count: z.int(),
          status: z.enum(['working', 'off', 'closed']),
        }),
      ),
    }),
  ),
});
export type ScheduleWeekResponse = z.infer<typeof scheduleWeekResponseSchema>;

export const whoIsInResponseSchema = z.object({
  date: isoDateSchema,
  entries: z.array(whoIsInEntrySchema),
});

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const bookingListQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  staffId: idSchema.optional(),
  status: bookingStatusSchema.optional(),
  source: bookingSourceSchema.optional(),
  /** Name, phone digits or reference code. */
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
export const bookingListResponseSchema = z.object({
  bookings: z.array(adminBookingViewSchema),
  nextCursor: z.string().nullable(),
});

export const auditEntryViewSchema = z.object({
  id: idSchema,
  at: z.iso.datetime(),
  actor: z.object({
    type: actorTypeSchema,
    userId: z.string().nullable(),
    staffId: z.string().nullable(),
  }),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  meta: z.unknown(),
  requestId: z.string().nullable(),
});
export type AuditEntryView = z.infer<typeof auditEntryViewSchema>;

export const outboxMessageViewSchema = z.object({
  id: idSchema,
  channel: z.string(),
  to: z.string(),
  template: z.string(),
  status: outboxStatusSchema,
  attempts: z.int(),
  maxAttempts: z.int(),
  lastError: z.string().nullable(),
  nextAttemptAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  bookingId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type OutboxMessageView = z.infer<typeof outboxMessageViewSchema>;

export const bookingDetailResponseSchema = z.object({
  booking: adminBookingViewSchema,
  audit: z.array(auditEntryViewSchema),
  outbox: z.array(outboxMessageViewSchema),
  /** Allowed next statuses for the caller. */
  transitions: z.array(bookingStatusSchema),
  /** The customer's manage link path (owner only), for "Copy manage link". Empty for barbers. */
  managePath: z.string().nullable().default(null),
});
export type BookingDetailResponse = z.infer<typeof bookingDetailResponseSchema>;

export const bookingResponseSchema = z.object({ booking: adminBookingViewSchema });

export const statusChangeRequestSchema = z.object({
  status: bookingStatusSchema,
  /** For cancel and restore: tell the customer by email when they gave one. */
  notify: z.boolean().default(false),
  reason: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});
export type StatusChangeRequest = z.input<typeof statusChangeRequestSchema>;

export const ownerCancelRequestSchema = z.object({
  reason: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
  notify: z.boolean().default(true),
});

export const ownerRescheduleRequestSchema = z.object({
  startAt: z.iso.datetime({ offset: true }),
  /** Defaults to the same chair. */
  staff: staffSelectorSchema.optional(),
  notify: z.boolean().default(true),
  /** Ignore lead time and the booking window. Never ignores a locked slot. */
  override: z.boolean().default(false),
});
export type OwnerRescheduleRequest = z.input<typeof ownerRescheduleRequestSchema>;

export const bookingNotesRequestSchema = z.object({
  notes: z.string().trim().max(MAX_NOTE_LENGTH).nullable(),
});

export const manualBookingRequestSchema = z
  .object({
    source: z.enum(['phone', 'walkIn']),
    serviceIds: z.array(idSchema).min(1).max(6),
    staff: staffSelectorSchema,
    /** Required for phone bookings; walk-ins default to now. */
    startAt: z.iso.datetime({ offset: true }).optional(),
    customer: bookingCustomerSchema,
    notes: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
    /** Phone only: ignore lead time and the booking window. Audited. */
    override: z.boolean().default(false),
    /** Send the customer a confirmation email when they gave one. */
    notifyCustomer: z.boolean().optional(),
  })
  .refine((v) => v.source === 'walkIn' || v.startAt !== undefined, {
    message: 'Phone bookings need a start time',
    path: ['startAt'],
  })
  .refine((v) => v.source === 'phone' || v.staff !== 'any', {
    message: 'Walk-ins need a specific chair',
    path: ['staff'],
  });
export type ManualBookingRequest = z.input<typeof manualBookingRequestSchema>;
export type ManualBookingInput = z.output<typeof manualBookingRequestSchema>;

export const manualBookingResponseSchema = z.object({
  booking: adminBookingViewSchema,
  managePath: z.string(),
  /** True when the time was only bookable because the owner overrode lead time or the window. */
  overrideUsed: z.boolean(),
  /** Walk-ins: the services fall outside the chair's working time. */
  outsideWorkingTime: z.boolean(),
});
export type ManualBookingResponse = z.infer<typeof manualBookingResponseSchema>;

export const customerQuerySchema = z.object({ phone: z.string().min(7).max(32) });
export const customerResponseSchema = z.object({
  /** The number in E.164, the key of every customer route. */
  phoneE164: z.string(),
  phone: z.string(),
  names: z.array(z.string()),
  emails: z.array(z.string()),
  counts: z.object({
    total: z.int(),
    upcoming: z.int(),
    completed: z.int(),
    noShow: z.int(),
    cancelled: z.int(),
  }),
  completedSpendCents: z.int(),
  bookings: z.array(adminBookingViewSchema),
  /** The owner's private note. Never shown to the customer or a barber. */
  notes: z.string().nullable(),
  usualBarber: staffRefSchema.nullable(),
});
export type CustomerResponse = z.infer<typeof customerResponseSchema>;

export const customerSortKeySchema = z.enum(['name', 'visits', 'last', 'noShows']);
export type CustomerSortKey = z.infer<typeof customerSortKeySchema>;
export const CUSTOMER_PAGE_SIZE = 25;
export const customerListQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
  sort: customerSortKeySchema.default('last'),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export const customerRowSchema = z.object({
  phoneE164: z.string(),
  phone: z.string(),
  name: z.string(),
  bookings: z.int(),
  visits: z.int(),
  noShows: z.int(),
  lastVisitAt: z.iso.datetime().nullable(),
  usualBarber: z.string().nullable(),
  hasNotes: z.boolean(),
});
export const customerListResponseSchema = z.object({
  rows: z.array(customerRowSchema),
  total: z.int(),
  page: z.int(),
  pageSize: z.int(),
});
export type CustomerListResponse = z.infer<typeof customerListResponseSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export const customerNotesRequestSchema = z.object({
  phone: z.string().min(7).max(32),
  notes: z.string().trim().max(2000),
});

// ---------------------------------------------------------------------------
// Time blocks and day status
// ---------------------------------------------------------------------------

export const timeBlockCreateRequestSchema = z
  .object({
    staffId: idSchema,
    kind: timeBlockKindSchema,
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().max(200).optional(),
    resolutions: resolutionsSchema,
  })
  .refine((v) => new Date(v.endAt).getTime() > new Date(v.startAt).getTime(), {
    message: 'The end must be after the start',
    path: ['endAt'],
  })
  .refine(
    (v) => new Date(v.endAt).getTime() - new Date(v.startAt).getTime() <= 90 * 24 * 3600_000,
    {
      message: 'Blocks are limited to 90 days',
      path: ['endAt'],
    },
  );
export type TimeBlockCreateRequest = z.input<typeof timeBlockCreateRequestSchema>;

/** Barbers block their own chair, so staffId is implied; only short blocks and time off. */
export const timeBlockResponseSchema = z
  .object({ timeBlock: timeBlockViewSchema })
  .extend(conflictOutcomeSchema.shape);
export const timeBlockListQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  staffId: idSchema.optional(),
});
export const timeBlockListResponseSchema = z.object({ timeBlocks: z.array(timeBlockViewSchema) });
export const resolutionsBodySchema = z.object({ resolutions: resolutionsSchema });
export const conflictOnlyResponseSchema = conflictOutcomeSchema.extend({ ok: z.literal(true) });

export const dayStatusRequestSchema = z
  .object({
    date: isoDateSchema,
    status: z.enum(['in', 'out']),
    /** With "in": extra hours on a day this person does not normally work. */
    start: hhmmSchema.optional(),
    end: hhmmSchema.optional(),
    resolutions: resolutionsSchema,
  })
  .refine((v) => (v.start === undefined) === (v.end === undefined), {
    message: 'Give both a start and an end',
    path: ['end'],
  })
  .refine((v) => v.start === undefined || v.end === undefined || v.start < v.end, {
    message: 'The end must be after the start',
    path: ['end'],
  })
  .refine((v) => v.status === 'in' || v.start === undefined, {
    message: 'Hours only apply when marking someone in',
    path: ['start'],
  });
export type DayStatusRequest = z.input<typeof dayStatusRequestSchema>;
export const dayStatusResponseSchema = conflictOutcomeSchema.extend({ entry: whoIsInEntrySchema });

// ---------------------------------------------------------------------------
// Catalog: services, staff, hours, closures, settings, logins
// ---------------------------------------------------------------------------

export const adminServiceViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  group: z.enum(['Barber', 'Beauty']),
  description: z.string(),
  priceCents: z.int(),
  priceFrom: z.boolean(),
  durationMinutes: z.int(),
  bufferMinutes: z.int().nullable(),
  sortOrder: z.int(),
  isActive: z.boolean(),
  deletedAt: z.iso.datetime().nullable(),
});
export type AdminServiceView = z.infer<typeof adminServiceViewSchema>;
export const serviceListResponseSchema = z.object({ services: z.array(adminServiceViewSchema) });
export const serviceResponseSchema = z.object({ service: adminServiceViewSchema });
export const serviceCreateRequestSchema = serviceInputSchema;
export const serviceUpdateRequestSchema = serviceUpdateSchema;

export const adminStaffViewSchema = z.object({
  id: idSchema,
  slug: z.string(),
  slugAliases: z.array(z.string()),
  name: z.string(),
  role: z.enum(['owner', 'barber', 'stylist']),
  title: z.string(),
  specialty: z.string(),
  bio: z.string(),
  chairNumber: z.int().nullable(),
  serviceIds: z.array(idSchema),
  photoUrl: z.string().nullable(),
  instagramHandle: z.string().nullable(),
  sortOrder: z.int(),
  acceptsOnlineBooking: z.boolean(),
  showOnWebsite: z.boolean(),
  deletedAt: z.iso.datetime().nullable(),
});
export type AdminStaffView = z.infer<typeof adminStaffViewSchema>;
export const staffListResponseSchema = z.object({ staff: z.array(adminStaffViewSchema) });
export const staffResponseSchema = z.object({ staff: adminStaffViewSchema });
export const staffCreateRequestSchema = staffInputSchema;
export const staffUpdateRequestSchema = staffUpdateSchema
  .omit({ slug: true })
  .extend({ resolutions: resolutionsSchema });
export const staffSlugRequestSchema = z.object({ slug: slugSchema });
export const staffMutationResponseSchema = staffResponseSchema.extend(conflictOutcomeSchema.shape);

export const hoursResponseSchema = z.object({
  shop: weekHoursSchema,
  staff: z.array(z.object({ staffId: idSchema, days: weekHoursSchema })),
});
export type HoursResponse = z.infer<typeof hoursResponseSchema>;
export const hoursRequestSchema = z.object({
  days: weekHoursSchema,
  resolutions: resolutionsSchema,
});
export type HoursRequest = z.input<typeof hoursRequestSchema>;

export const closureViewSchema = z.object({
  id: idSchema,
  date: isoDateSchema,
  kind: z.enum(['closed', 'specialHours']),
  intervals: z.array(z.object({ start: hhmmSchema, end: hhmmSchema })),
  label: z.string(),
});
export const closureListQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export const closureListResponseSchema = z.object({ closures: z.array(closureViewSchema) });
export const closureUpsertRequestSchema = z.intersection(
  closureInputSchema,
  z.object({ resolutions: resolutionsSchema }),
);
export const closureResponseSchema = z
  .object({ closure: closureViewSchema })
  .extend(conflictOutcomeSchema.shape);

export const settingsResponseSchema = z.object({ settings: shopSettingsInputSchema });
export const settingsRequestSchema = shopSettingsInputSchema;

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/** One number for today (or this week) and, only when last week has data, the same number then. */
export const overviewStatSchema = z.object({ value: z.int(), compare: z.int().nullable() });

export const activityKindSchema = z.enum(['booked', 'canceled', 'rescheduled', 'noShow', 'walkIn']);
export type ActivityKind = z.infer<typeof activityKindSchema>;
export const activityEntrySchema = z.object({
  id: idSchema,
  at: z.iso.datetime(),
  kind: activityKindSchema,
  bookingId: idSchema,
  clientName: z.string(),
  staffName: z.string(),
  status: bookingStatusSchema,
});

export const overviewChairSchema = z.object({
  staff: staffRefSchema,
  photo: photoViewSchema.nullable(),
  status: z.enum(['in', 'off', 'closed']),
  current: adminBookingViewSchema.nullable(),
  next: adminBookingViewSchema.nullable(),
});

export const alertViewSchema = z.object({
  id: idSchema,
  kind: alertKindSchema,
  staffId: idSchema,
  staffName: z.string(),
  fromDate: isoDateSchema,
  toDate: isoDateSchema,
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Confirmed bookings the owner still has to decide on, counted when the page loads. */
  affectedCount: z.int(),
});
export type AlertView = z.infer<typeof alertViewSchema>;

export const overviewResponseSchema = z.object({
  date: isoDateSchema,
  now: z.iso.datetime(),
  /** "Tuesday": the compare line says "vs last Tuesday". */
  weekdayName: z.string(),
  stats: z.object({
    bookings: overviewStatSchema,
    bookedValueCents: overviewStatSchema,
    walkIns: overviewStatSchema,
    noShowsWeek: overviewStatSchema,
  }),
  /** Monday to Sunday: bookings this week against last week. */
  week: z.array(
    z.object({
      date: isoDateSchema,
      label: z.string(),
      thisWeek: z.int(),
      lastWeek: z.int(),
      today: z.boolean(),
    }),
  ),
  chairs: z.array(overviewChairSchema),
  activity: z.array(activityEntrySchema),
  alerts: z.array(alertViewSchema),
});
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;

// ---------------------------------------------------------------------------
// Bookings table (server paged, sortable)
// ---------------------------------------------------------------------------

export const bookingRangeSchema = z.enum(['today', 'tomorrow', 'week', 'upcoming', 'past', 'all']);
export type BookingRange = z.infer<typeof bookingRangeSchema>;
export const bookingSortKeySchema = z.enum(['when', 'client', 'status', 'source']);
export type BookingSortKey = z.infer<typeof bookingSortKeySchema>;
export const BOOKING_TABLE_PAGE_SIZE = 25;

export const bookingTableQuerySchema = z.object({
  range: bookingRangeSchema.default('upcoming'),
  staffId: idSchema.optional(),
  status: bookingStatusSchema.optional(),
  sort: bookingSortKeySchema.default('when'),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type BookingTableQuery = z.input<typeof bookingTableQuerySchema>;
export const bookingTableResponseSchema = z.object({
  rows: z.array(adminBookingViewSchema),
  total: z.int(),
  page: z.int(),
  pageSize: z.int(),
  /** How many bookings each quick filter holds, with the barber and status filters applied. */
  counts: z.object({
    today: z.int(),
    tomorrow: z.int(),
    week: z.int(),
    upcoming: z.int(),
    past: z.int(),
  }),
});
export type BookingTableResponse = z.infer<typeof bookingTableResponseSchema>;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchQuerySchema = z.object({ q: z.string().trim().max(80).default('') });
export const searchBookingHitSchema = z.object({
  id: idSchema,
  referenceCode: z.string(),
  customerName: z.string(),
  startAt: z.iso.datetime(),
  status: bookingStatusSchema,
  staffName: z.string(),
  services: z.string(),
});
export const searchCustomerHitSchema = z.object({
  phone: z.string(),
  name: z.string(),
  visits: z.int(),
  lastVisitAt: z.iso.datetime(),
});
/** At most five of each. Owner only, so a full phone number is fine here. */
export const searchResponseSchema = z.object({
  bookings: z.array(searchBookingHitSchema),
  customers: z.array(searchCustomerHitSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// ---------------------------------------------------------------------------
// Audit and outbox viewers
// ---------------------------------------------------------------------------

export const auditListQuerySchema = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  /** Prefix match, for example "booking." or "auth.login". */
  action: z.string().max(60).optional(),
  actorType: actorTypeSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
export const auditListResponseSchema = z.object({
  entries: z.array(auditEntryViewSchema),
  nextCursor: z.string().nullable(),
});

export const outboxListQuerySchema = z.object({
  status: outboxStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const outboxListResponseSchema = z.object({
  messages: z.array(outboxMessageViewSchema),
  nextCursor: z.string().nullable(),
});
