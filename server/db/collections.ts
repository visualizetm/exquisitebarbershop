import type { Collection, Document } from 'mongodb';
import type { AuditLogDocument } from '../../shared/schemas/auditLog';
import type { BookingDocument } from '../../shared/schemas/booking';
import type { ClosureDocument } from '../../shared/schemas/closure';
import type { EmailOutboxDocument } from '../../shared/schemas/emailOutbox';
import type { IdempotencyKeyDocument } from '../../shared/schemas/idempotencyKey';
import type { LoginThrottleDocument } from '../../shared/schemas/loginThrottle';
import type { PhotoDocument } from '../../shared/schemas/photo';
import type { ScheduleGuardDocument } from '../../shared/schemas/scheduleGuard';
import type { RateLimitDocument } from '../../shared/schemas/rateLimit';
import type { ServiceDocument } from '../../shared/schemas/service';
import type { SessionDocument } from '../../shared/schemas/session';
import type { ShopSettingsDocument } from '../../shared/schemas/shopSettings';
import type { SlotLockDocument } from '../../shared/schemas/slotLock';
import type { StaffDocument } from '../../shared/schemas/staff';
import type { TimeBlockDocument } from '../../shared/schemas/timeBlock';
import type { UserDocument } from '../../shared/schemas/user';
import type { WeeklyHoursDocument } from '../../shared/schemas/weeklyHours';
import { getDb } from './client';
import { COLLECTIONS, type CollectionName } from './indexes';

export interface CollectionTypes {
  shopSettings: ShopSettingsDocument;
  staff: StaffDocument;
  services: ServiceDocument;
  weeklyHours: WeeklyHoursDocument;
  closures: ClosureDocument;
  timeBlocks: TimeBlockDocument;
  bookings: BookingDocument;
  slotLocks: SlotLockDocument;
  users: UserDocument;
  sessions: SessionDocument;
  auditLog: AuditLogDocument;
  emailOutbox: EmailOutboxDocument;
  idempotencyKeys: IdempotencyKeyDocument;
  rateLimits: RateLimitDocument;
  loginThrottle: LoginThrottleDocument;
  scheduleGuards: ScheduleGuardDocument;
  photos: PhotoDocument;
}

/** Typed access to a collection. Only repositories call this. */
export async function collection<N extends CollectionName>(
  name: N,
): Promise<Collection<CollectionTypes[N] & Document>> {
  const db = await getDb();
  return db.collection<CollectionTypes[N] & Document>(COLLECTIONS[name]);
}
