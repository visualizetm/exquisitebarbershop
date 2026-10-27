import type { CreateIndexesOptions, Db, IndexSpecification } from 'mongodb';

export const COLLECTIONS = {
  shopSettings: 'shopSettings',
  staff: 'staff',
  services: 'services',
  weeklyHours: 'weeklyHours',
  closures: 'closures',
  timeBlocks: 'timeBlocks',
  bookings: 'bookings',
  walkIns: 'walkIns',
  slotLocks: 'slotLocks',
  users: 'users',
  sessions: 'sessions',
  auditLog: 'auditLog',
  emailOutbox: 'emailOutbox',
  idempotencyKeys: 'idempotencyKeys',
  rateLimits: 'rateLimits',
  loginThrottle: 'loginThrottle',
  scheduleGuards: 'scheduleGuards',
  photos: 'photos',
  pendingUploads: 'pendingUploads',
  systemState: 'systemState',
  alerts: 'alerts',
  customerNotes: 'customerNotes',
  staffPins: 'staffPins',
  setupTokens: 'setupTokens',
  teamSessions: 'teamSessions',
  kioskDevices: 'kioskDevices',
} as const;
export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export interface IndexDefinition {
  collection: CollectionName;
  keys: IndexSpecification;
  options: CreateIndexesOptions & { name: string };
  /** Why the index exists. Mirrored in docs/ARCHITECTURE.md. */
  reason: string;
}

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Every index in the system. `scripts/indexes.ts` and the test harness both create
 * exactly this list, so what tests prove is what production runs.
 */
export const INDEXES: readonly IndexDefinition[] = [
  // staff
  {
    collection: 'staff',
    keys: { slugKeys: 1 },
    options: { name: 'uniq_slugKeys', unique: true },
    reason:
      'No slug, current or former, may belong to two staff members. Multikey, so aliases are covered.',
  },
  {
    collection: 'staff',
    keys: { deletedAt: 1, showOnWebsite: 1, sortOrder: 1 },
    options: { name: 'public_listing' },
    reason: 'Public team listing: active, visible staff in display order.',
  },
  // services
  {
    collection: 'services',
    keys: { deletedAt: 1, isActive: 1, group: 1, sortOrder: 1 },
    options: { name: 'public_listing' },
    reason: 'Public services menu grouped and ordered without a collection scan.',
  },
  // weeklyHours
  {
    collection: 'weeklyHours',
    keys: { subjectType: 1, staffId: 1 },
    options: { name: 'uniq_subject', unique: true },
    reason: 'Exactly one hours document per subject (the shop, or one staff member).',
  },
  // closures
  {
    collection: 'closures',
    keys: { date: 1 },
    options: { name: 'uniq_date', unique: true },
    reason: 'One exception per calendar day; also the lookup key for availability.',
  },
  // timeBlocks
  {
    collection: 'timeBlocks',
    keys: { staffId: 1, startAt: 1, endAt: 1 },
    options: { name: 'staff_range' },
    reason: 'Availability and schedule views query blocks for one staff member in a time range.',
  },
  {
    collection: 'timeBlocks',
    keys: { startAt: 1 },
    options: { name: 'by_start' },
    reason: 'Shop-wide schedule views for a day.',
  },
  // walkIns: the line in order, and the day's seated and left entries by time
  {
    collection: 'walkIns',
    keys: { status: 1, position: 1 },
    options: { name: 'status_position' },
    reason: 'The walk-in line is read and reordered by status and position.',
  },
  {
    collection: 'walkIns',
    keys: { createdAt: 1 },
    options: { name: 'createdAt' },
    reason: "Today's seated and left entries are listed by when they joined.",
  },
  // bookings
  {
    collection: 'bookings',
    keys: { referenceCode: 1 },
    options: { name: 'uniq_referenceCode', unique: true },
    reason: 'Reference codes are the human handle for a booking and must be unique.',
  },
  {
    collection: 'bookings',
    keys: { staffId: 1, startAt: 1 },
    options: { name: 'staff_start' },
    reason: 'A barber schedule for a day and the availability engine reading existing bookings.',
  },
  {
    collection: 'bookings',
    keys: { startAt: 1, status: 1 },
    options: { name: 'start_status' },
    reason: "The owner's day view and reminder jobs scan a time window by status.",
  },
  {
    collection: 'bookings',
    keys: { 'customer.phone': 1, startAt: -1 },
    options: { name: 'customer_phone' },
    reason: 'Open-bookings-per-phone guard and owner lookup of a customer history.',
  },
  {
    collection: 'bookings',
    keys: { 'customer.phone': 1 },
    options: {
      name: 'launchOfferOncePerPhone',
      unique: true,
      partialFilterExpression: {
        'discounts.code': 'LAUNCH10',
        status: { $in: ['confirmed', 'completed', 'noShow'] },
      },
    },
    reason:
      'The launch offer goes to one booking per phone: two first bookings placed at once cannot both carry it, and a cancelled one frees it.',
  },
  {
    collection: 'bookings',
    keys: { nameKey: 1, startAt: -1 },
    options: { name: 'by_name_key' },
    reason: "The owner's search finds a customer by the start of the name, any case or accent.",
  },
  // alerts
  {
    collection: 'alerts',
    keys: { status: 1, createdAt: 1 },
    options: { name: 'open_queue' },
    reason: 'The overview lists open alerts, oldest first, without a collection scan.',
  },
  // customerNotes
  {
    collection: 'customerNotes',
    keys: { phone: 1 },
    options: { name: 'uniq_phone', unique: true },
    reason: 'One private note per customer phone number.',
  },
  // staffPins
  {
    collection: 'staffPins',
    keys: { staffId: 1 },
    options: { name: 'uniq_staff', unique: true },
    reason: 'At most one PIN per barber; sign-in looks it up by staff id.',
  },
  // setupTokens
  {
    collection: 'setupTokens',
    keys: { tokenHash: 1 },
    options: { name: 'uniq_tokenHash', unique: true },
    reason: 'A setup link is found by the hash of its token.',
  },
  {
    collection: 'setupTokens',
    keys: { expiresAt: 1 },
    options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 },
    reason: 'MongoDB removes expired setup links on its own.',
  },
  {
    collection: 'setupTokens',
    keys: { staffId: 1 },
    options: { name: 'by_staff' },
    reason: "A new link retires the barber's earlier ones.",
  },
  // kioskDevices
  {
    collection: 'kioskDevices',
    keys: { tokenHash: 1 },
    options: {
      name: 'uniq_tokenHash',
      unique: true,
      partialFilterExpression: { tokenHash: { $type: 'string' } },
    },
    reason: 'The tablet cookie is looked up by its token hash on every kiosk request.',
  },
  // teamSessions
  {
    collection: 'teamSessions',
    keys: { tokenHash: 1 },
    options: { name: 'uniq_tokenHash', unique: true },
    reason: 'Barber session lookup on every portal request.',
  },
  {
    collection: 'teamSessions',
    keys: { expiresAt: 1 },
    options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 },
    reason: 'MongoDB removes expired barber sessions on its own.',
  },
  {
    collection: 'teamSessions',
    keys: { staffId: 1 },
    options: { name: 'by_staff' },
    reason: 'A new PIN or a reset ends every session of one barber.',
  },
  // slotLocks
  {
    collection: 'slotLocks',
    keys: { staffId: 1, slotStart: 1 },
    options: { name: 'uniq_staff_slot', unique: true },
    reason: 'The double booking guard: a chair can hold one lock per 15 minute block.',
  },
  {
    collection: 'slotLocks',
    keys: { holderId: 1 },
    options: { name: 'by_holder' },
    reason: 'Release every lock of a booking or block in one delete.',
  },
  // users
  {
    collection: 'users',
    keys: { email: 1 },
    options: { name: 'uniq_email', unique: true },
    reason: 'Login identity. Email is normalized to lowercase before storage.',
  },
  {
    collection: 'users',
    keys: { staffId: 1 },
    options: {
      name: 'by_staff',
      unique: true,
      partialFilterExpression: { staffId: { $type: 'string' } },
    },
    reason: 'At most one login per staff member; lookup from staff to login.',
  },
  // sessions
  {
    collection: 'sessions',
    keys: { tokenHash: 1 },
    options: { name: 'uniq_tokenHash', unique: true },
    reason: 'Session lookup on every authenticated request.',
  },
  {
    collection: 'sessions',
    keys: { expiresAt: 1 },
    options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 },
    reason: 'MongoDB removes expired sessions on its own.',
  },
  {
    collection: 'sessions',
    keys: { userId: 1 },
    options: { name: 'by_user' },
    reason: 'Revoke every session of a user (password change, deactivation).',
  },
  // auditLog
  {
    collection: 'auditLog',
    keys: { entityType: 1, entityId: 1, at: -1 },
    options: { name: 'entity_history' },
    reason: 'History of one booking or staff record, newest first.',
  },
  {
    collection: 'auditLog',
    keys: { at: -1 },
    options: { name: 'by_time' },
    reason: 'Owner audit screen, newest first.',
  },
  // emailOutbox
  {
    collection: 'emailOutbox',
    keys: { status: 1, nextAttemptAt: 1 },
    options: { name: 'delivery_queue' },
    reason: 'The deliverer picks pending messages whose retry time has come.',
  },
  {
    collection: 'emailOutbox',
    keys: { dedupeKey: 1 },
    options: {
      name: 'uniq_dedupeKey',
      unique: true,
      partialFilterExpression: { dedupeKey: { $type: 'string' } },
    },
    reason: 'The same notification for the same event is never enqueued twice.',
  },
  {
    collection: 'emailOutbox',
    keys: { bookingId: 1, createdAt: -1 },
    options: { name: 'by_booking' },
    reason: 'Show the messages sent for a booking in the owner view.',
  },
  // idempotencyKeys
  {
    collection: 'idempotencyKeys',
    keys: { scope: 1, key: 1 },
    options: { name: 'uniq_scope_key', unique: true },
    reason:
      'A retried request with the same key returns the stored response instead of acting twice.',
  },
  {
    collection: 'idempotencyKeys',
    keys: { expiresAt: 1 },
    options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 },
    reason: 'Keys are only kept for a day.',
  },
  // rateLimits
  {
    collection: 'rateLimits',
    keys: { key: 1, windowStart: 1 },
    options: { name: 'uniq_key_window', unique: true },
    reason: 'One counter per key and window; upserts increment atomically.',
  },
  {
    collection: 'rateLimits',
    keys: { expiresAt: 1 },
    options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 },
    reason: 'Old windows disappear on their own.',
  },
  // loginThrottle
  {
    collection: 'loginThrottle',
    keys: { expiresAt: 1 },
    options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 },
    reason: 'Failure history is forgotten a day after the last failed sign-in.',
  },
  // photos (prompt 4)
  {
    collection: 'photos',
    keys: { kind: 1, deletedAt: 1, sortOrder: 1 },
    options: { name: 'kind_live_order' },
    reason: 'Gallery and hero reads in display order, skipping deleted photos.',
  },
  {
    collection: 'photos',
    keys: { staffId: 1, kind: 1 },
    options: { name: 'by_staff_kind' },
    reason: "A chair's portrait and work photos.",
  },
  // pendingUploads (prompt 5)
  {
    collection: 'pendingUploads',
    keys: { key: 1 },
    options: { name: 'uniq_key', unique: true },
    reason: 'Confirming an upload removes its record by key.',
  },
  {
    collection: 'pendingUploads',
    keys: { issuedAt: 1 },
    options: { name: 'by_issued' },
    reason: 'The daily sweep picks up uploads issued over an hour ago that were never confirmed.',
  },
  // bookings (prompt 3)
  {
    collection: 'bookings',
    keys: { status: 1, source: 1, ownerSeenAt: 1, startAt: 1 },
    options: { name: 'unseen_new' },
    reason: 'Dashboard count of online bookings the owner has not opened yet.',
  },
];

export { DAY_SECONDS };

/** Creates every index. Safe to run repeatedly: createIndex is a no-op for an identical existing index. */
export async function ensureIndexes(db: Db): Promise<{ created: string[] }> {
  const created: string[] = [];
  for (const def of INDEXES) {
    const name = await db.collection(def.collection).createIndex(def.keys, def.options);
    created.push(`${def.collection}.${name}`);
  }
  return { created };
}
