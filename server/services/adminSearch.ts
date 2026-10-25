import type { SearchResponse } from '../../shared/api/admin';
import { formatUsPhone } from '../../shared/lib/phone';
import { normalizeReferenceCode } from '../../shared/lib/referenceCode';
import { classifySearch } from '../../shared/lib/search';
import type { BookingDocument } from '../../shared/schemas/booking';
import { bookingsRepo, staffRepo } from '../repos';

const LIMIT = 5;

let backfilled: Promise<unknown> | null = null;

/** Bookings written before the name key existed get one, once per process. */
function ensureNameKeys(): Promise<unknown> {
  backfilled ??= bookingsRepo.backfillNameKeys().catch((error: unknown) => {
    backfilled = null;
    throw error;
  });
  return backfilled;
}

export function resetNameKeyBackfillForTests(): void {
  backfilled = null;
}

/**
 * The top bar search. A booking code matches exactly; digits match a phone number in any format
 * (the last four are enough); anything else is the start of a name, ignoring case and accents.
 * Five bookings and five customers at most.
 */
export async function adminSearch(rawQuery: string): Promise<SearchResponse> {
  const query = classifySearch(rawQuery);
  if (query.kind === 'empty') return { bookings: [], customers: [] };
  await ensureNameKeys();

  const match =
    query.kind === 'phone'
      ? ({ kind: 'phone', digits: query.digits } as const)
      : ({ kind: 'name', key: query.key } as const);
  const code = query.kind === 'text' ? normalizeReferenceCode(rawQuery) : null;

  const [byCode, found, customers, staff] = await Promise.all([
    code ? bookingsRepo.findBookingByReferenceCode(code) : Promise.resolve(null),
    bookingsRepo.searchBookings(match, LIMIT),
    bookingsRepo.searchCustomers(match, LIMIT),
    staffRepo.listStaff({ includeDeleted: true }),
  ]);
  const staffById = new Map(staff.map((s) => [s._id, s]));
  const unique = new Map<string, BookingDocument>();
  for (const b of [...(byCode ? [byCode] : []), ...found]) unique.set(b._id, b);

  return {
    bookings: [...unique.values()].slice(0, LIMIT).map((b) => ({
      id: b._id,
      referenceCode: b.referenceCode,
      customerName: b.customer.name,
      startAt: b.startAt.toISOString(),
      status: b.status,
      staffName: staffById.get(b.staffId)?.name ?? 'Unknown',
      services: b.services.map((s) => s.name).join(', '),
    })),
    customers: customers.map((c) => ({
      phone: formatUsPhone(c.phone),
      name: c.name,
      visits: c.visits,
      lastVisitAt: c.lastVisitAt.toISOString(),
    })),
  };
}
