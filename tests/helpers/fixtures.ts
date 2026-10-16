import type { BookingInput } from '../../server/repos/bookingsRepo';
import { newId } from '../../server/lib/ids';
import type { ServiceInput } from '../../shared/schemas/service';
import type { StaffInput } from '../../shared/schemas/staff';
import { generateReferenceCode } from '../../shared/lib/referenceCode';

export function staffInput(overrides: Partial<StaffInput> = {}): StaffInput {
  return {
    slug: 'test-barber',
    name: 'Test Barber',
    role: 'barber',
    title: 'Barber',
    specialty: 'Fades',
    bio: '',
    chairNumber: 2,
    serviceIds: [],
    photoUrl: null,
    instagramHandle: null,
    sortOrder: 10,
    acceptsOnlineBooking: true,
    showOnWebsite: true,
    ...overrides,
  };
}

export function serviceInput(overrides: Partial<ServiceInput> = {}): ServiceInput {
  return {
    name: 'Classic Cut',
    group: 'Barber',
    description: 'A cut',
    priceCents: 3000,
    priceFrom: false,
    durationMinutes: 30,
    sortOrder: 10,
    isActive: true,
    ...overrides,
  };
}

export function bookingInput(overrides: Partial<BookingInput> = {}): BookingInput {
  const startAt = new Date('2026-03-12T14:00:00.000Z');
  return {
    referenceCode: generateReferenceCode(),
    staffId: newId(),
    staffRequested: true,
    services: [
      {
        serviceId: newId(),
        name: 'Classic Cut',
        group: 'Barber',
        priceCents: 3000,
        priceFrom: false,
        durationMinutes: 30,
      },
    ],
    startAt,
    endAt: new Date(startAt.getTime() + 30 * 60_000),
    durationMinutes: 30,
    bufferMinutes: 0,
    totalPriceCents: 3000,
    customer: { name: 'Sam Customer', phone: '+12155550123', email: null },
    status: 'confirmed',
    source: 'online',
    notes: null,
    cancellation: null,
    rescheduledFromId: null,
    manageTokenVersion: 1,
    ...overrides,
  };
}
