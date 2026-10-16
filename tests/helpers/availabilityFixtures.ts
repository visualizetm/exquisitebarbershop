import { newId } from '../../server/lib/ids';
import type { AvailabilityContext } from '../../server/services/availability';
import { bookingSettingsSchema, type BookingSettings } from '../../shared/schemas/shopSettings';
import type { BookingDocument } from '../../shared/schemas/booking';
import type { ClosureDocument } from '../../shared/schemas/closure';
import type { WeekHours } from '../../shared/schemas/common';
import type { ServiceDocument } from '../../shared/schemas/service';
import type { StaffDocument } from '../../shared/schemas/staff';
import type { TimeBlockDocument } from '../../shared/schemas/timeBlock';
import { shopLocalToUtc } from '../../shared/lib/time';

const NOW = new Date('2026-03-10T15:00:00.000Z'); // Tue Mar 10 2026, 11:00 EDT... (EST until Mar 8; EDT after)

export const nineToFive: WeekHours = {
  mon: [{ start: '09:00', end: '17:00' }],
  tue: [{ start: '09:00', end: '17:00' }],
  wed: [{ start: '09:00', end: '17:00' }],
  thu: [{ start: '09:00', end: '17:00' }],
  fri: [{ start: '09:00', end: '17:00' }],
  sat: [{ start: '09:00', end: '17:00' }],
  sun: [],
};

export function service(overrides: Partial<ServiceDocument> = {}): ServiceDocument {
  return {
    _id: newId(),
    name: 'Cut',
    group: 'Barber',
    description: '',
    priceCents: 3000,
    priceFrom: false,
    durationMinutes: 30,
    bufferMinutes: null,
    sortOrder: 0,
    isActive: true,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function staff(overrides: Partial<StaffDocument> = {}): StaffDocument {
  const slug = overrides.slug ?? `staff-${newId().slice(0, 6)}`;
  return {
    _id: newId(),
    slug,
    slugAliases: [],
    slugKeys: [slug],
    name: 'Staff',
    role: 'barber',
    title: 'Barber',
    specialty: '',
    bio: '',
    chairNumber: 1,
    serviceIds: [],
    photoUrl: null,
    instagramHandle: null,
    sortOrder: 0,
    acceptsOnlineBooking: true,
    showOnWebsite: true,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function booking(
  overrides: Partial<BookingDocument> & { staffId: string; startAt: Date },
): BookingDocument {
  const durationMinutes = overrides.durationMinutes ?? 30;
  return {
    _id: newId(),
    referenceCode: 'ABC-DEFG',
    staffRequested: true,
    services: [],
    endAt: new Date(overrides.startAt.getTime() + durationMinutes * 60_000),
    durationMinutes,
    bufferMinutes: 0,
    totalPriceCents: 0,
    customer: { name: 'X', phone: '+12155550100', email: null },
    status: 'confirmed',
    source: 'online',
    notes: null,
    cancellation: null,
    rescheduledFromId: null,
    manageTokenVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function block(
  overrides: Partial<TimeBlockDocument> & { staffId: string; startAt: Date; endAt: Date },
): TimeBlockDocument {
  return {
    _id: newId(),
    kind: 'block',
    reason: null,
    createdBy: { type: 'owner', userId: null, staffId: null },
    createdAt: NOW,
    ...overrides,
  };
}

export function closure(date: string, overrides: Partial<ClosureDocument> = {}): ClosureDocument {
  return {
    _id: newId(),
    date,
    kind: 'closed',
    intervals: [],
    label: 'Holiday',
    createdAt: NOW,
    ...overrides,
  };
}

export function settings(overrides: Partial<BookingSettings> = {}): BookingSettings {
  return bookingSettingsSchema.parse({ bufferMinutes: 0, leadTimeMinutes: 0, ...overrides });
}

export type ContextOverrides = Partial<AvailabilityContext>;

/** A shop with one 30 minute service and the given staff, open 9 to 5 Monday to Saturday. */
export function context(overrides: ContextOverrides = {}): AvailabilityContext {
  return {
    settings: settings(),
    services: [],
    staff: [],
    shopHours: nineToFive,
    staffHours: new Map(),
    closures: [],
    timeBlocks: [],
    bookings: [],
    now: NOW,
    ...overrides,
  };
}

export function at(date: string, hhmm: string): Date {
  return shopLocalToUtc(date, hhmm);
}

export function hhmmList(dates: readonly Date[]): string[] {
  return dates.map((d) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d),
  );
}

export { NOW as FIXTURE_NOW };
