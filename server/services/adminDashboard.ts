import type { DateTime } from 'luxon';
import { sumAfterDiscounts } from '../../shared/lib/launchOffer';
import {
  BOOKING_TABLE_PAGE_SIZE,
  type BookingTableQuery,
  type BookingTableResponse,
  type OverviewResponse,
} from '../../shared/api/admin';
import { bookingTableQuerySchema } from '../../shared/api/admin';
import type { BookingDocument } from '../../shared/schemas/booking';
import { shopDateOf, shopDayStart } from '../../shared/lib/time';
import { auditLogRepo, bookingsRepo, staffRepo } from '../repos';
import { activeStaff, whoIsInFor } from './adminBookings';
import { toAdminBookingView, toStaffRef } from './bookingView';
import { staffPhotoMap } from './photosService';
import { loadScheduleData } from './scheduleData';
import { listAlertViews } from './alerts';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday of the shop week that holds a date. */
function weekStart(date: string): DateTime {
  return shopDayStart(date).startOf('week');
}

const live = (b: BookingDocument) => b.status !== 'cancelled';
const valueOf = (list: BookingDocument[]) => sumAfterDiscounts(list.filter(live));

/**
 * The owner overview: today's four numbers (each with last week's figure only when last week
 * has bookings to compare with), this week against last week by day, one row per chair, the
 * latest eight events and the alerts that need a decision. Every number is computed here from
 * bookings; nothing is estimated.
 */
export async function overview(now: Date): Promise<OverviewResponse> {
  const today = shopDateOf(now);
  const monday = weekStart(today);
  const lastMonday = monday.minus({ weeks: 1 });
  const nextMonday = monday.plus({ weeks: 1 });
  const todayStart = shopDayStart(today);
  const sameDayLastWeek = todayStart.minus({ weeks: 1 }).toISODate() ?? today;

  const [data, weekBookings, photos, alerts, audit] = await Promise.all([
    loadScheduleData(today, today),
    bookingsRepo.listBookingsStartingBetween({
      start: lastMonday.toJSDate(),
      end: nextMonday.toJSDate(),
    }),
    staffPhotoMap(),
    listAlertViews(now),
    auditLogRepo.listAuditPage({ entityType: 'booking', actionPrefix: 'booking.' }, null, 60),
  ]);

  const dateOf = (b: BookingDocument) => shopDateOf(b.startAt);
  const onDate = (date: string) => weekBookings.filter((b) => dateOf(b) === date);
  const todays = onDate(today);
  const lastSame = onDate(sameDayLastWeek);
  const thisWeek = weekBookings.filter((b) => b.startAt >= monday.toJSDate());
  const lastWeek = weekBookings.filter((b) => b.startAt < monday.toJSDate());
  const compareDay = lastSame.filter(live).length > 0;
  const compareWeek = lastWeek.filter(live).length > 0;
  const walkIns = (list: BookingDocument[]) =>
    list.filter((b) => live(b) && b.source === 'walkIn').length;
  const noShows = (list: BookingDocument[]) => list.filter((b) => b.status === 'noShow').length;

  const week = DAY_LABELS.map((label, i) => {
    const date = monday.plus({ days: i }).toISODate() ?? today;
    const lastDate = lastMonday.plus({ days: i }).toISODate() ?? today;
    return {
      date,
      label,
      thisWeek: onDate(date).filter(live).length,
      lastWeek: onDate(lastDate).filter(live).length,
      today: date === today,
    };
  });

  const chairs = activeStaff(data.staff).map((s) => {
    const who = whoIsInFor(s, today, data.source);
    const mine = todays
      .filter((b) => b.staffId === s._id && b.status === 'confirmed')
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const current = mine.find((b) => b.startAt <= now && b.endAt > now) ?? null;
    const next = mine.find((b) => b.startAt > now) ?? null;
    return {
      staff: toStaffRef(s),
      photo: photos.get(s._id) ?? null,
      status:
        who.status === 'in'
          ? ('in' as const)
          : who.status === 'closed'
            ? ('closed' as const)
            : ('off' as const),
      current: current ? toAdminBookingView(current, s) : null,
      next: next ? toAdminBookingView(next, s) : null,
    };
  });

  return {
    date: today,
    now: now.toISOString(),
    weekdayName: todayStart.toFormat('cccc'),
    stats: {
      bookings: {
        value: todays.filter(live).length,
        compare: compareDay ? lastSame.filter(live).length : null,
      },
      bookedValueCents: { value: valueOf(todays), compare: compareDay ? valueOf(lastSame) : null },
      walkIns: { value: walkIns(todays), compare: compareDay ? walkIns(lastSame) : null },
      noShowsWeek: { value: noShows(thisWeek), compare: compareWeek ? noShows(lastWeek) : null },
    },
    week,
    chairs,
    activity: await activityFrom(audit),
    alerts,
  };
}

type AuditEntry = Awaited<ReturnType<typeof auditLogRepo.listAuditPage>>[number];

/** Turns booking audit entries into the five kinds of event the overview lists. */
async function activityFrom(audit: AuditEntry[]): Promise<OverviewResponse['activity']> {
  const picked: { entry: AuditEntry; kind: OverviewResponse['activity'][number]['kind'] }[] = [];
  for (const entry of audit) {
    const after = (entry.after ?? {}) as { status?: string };
    const meta = (entry.meta ?? {}) as { source?: string };
    if (entry.action === 'booking.create')
      picked.push({ entry, kind: meta.source === 'walkIn' ? 'walkIn' : 'booked' });
    else if (entry.action === 'booking.cancel') picked.push({ entry, kind: 'canceled' });
    else if (entry.action === 'booking.reschedule') picked.push({ entry, kind: 'rescheduled' });
    else if (entry.action === 'booking.status' && after.status === 'noShow')
      picked.push({ entry, kind: 'noShow' });
    if (picked.length === 8) break;
  }
  const [bookings, staff] = await Promise.all([
    bookingsRepo.findBookingsByIds(picked.map((p) => p.entry.entityId)),
    staffRepo.listStaff({ includeDeleted: true }),
  ]);
  const byId = new Map(bookings.map((b) => [b._id, b]));
  const staffById = new Map(staff.map((s) => [s._id, s.name]));
  const out: OverviewResponse['activity'] = [];
  for (const { entry, kind } of picked) {
    const b = byId.get(entry.entityId);
    if (!b) continue;
    out.push({
      id: entry._id,
      at: entry.at.toISOString(),
      kind,
      bookingId: b._id,
      clientName: b.customer.name,
      staffName: staffById.get(b.staffId) ?? 'Former staff',
      status: b.status,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bookings table
// ---------------------------------------------------------------------------

function rangeBounds(range: string, now: Date): { from?: Date; to?: Date } {
  const today = shopDateOf(now);
  const start = shopDayStart(today);
  switch (range) {
    case 'today':
      return { from: start.toJSDate(), to: start.plus({ days: 1 }).toJSDate() };
    case 'tomorrow':
      return { from: start.plus({ days: 1 }).toJSDate(), to: start.plus({ days: 2 }).toJSDate() };
    case 'week': {
      const monday = weekStart(today);
      return { from: monday.toJSDate(), to: monday.plus({ weeks: 1 }).toJSDate() };
    }
    case 'upcoming':
      return { from: now };
    case 'past':
      return { to: now };
    default:
      return {};
  }
}

export async function bookingTable(
  input: BookingTableQuery,
  now: Date,
): Promise<BookingTableResponse> {
  const query = bookingTableQuerySchema.parse(input);
  const base: bookingsRepo.TableFilter = {
    ...(query.staffId ? { staffId: query.staffId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const dir = query.dir ?? (query.range === 'past' ? 'desc' : 'asc');
  const filter = { ...base, ...rangeBounds(query.range, now) };
  const skip = (query.page - 1) * BOOKING_TABLE_PAGE_SIZE;
  const ranges = ['today', 'tomorrow', 'week', 'upcoming', 'past'] as const;
  const [rows, total, staff, ...counts] = await Promise.all([
    bookingsRepo.tablePage(
      filter,
      { key: query.sort, dir: dir === 'asc' ? 1 : -1 },
      skip,
      BOOKING_TABLE_PAGE_SIZE,
    ),
    bookingsRepo.countTable(filter),
    staffRepo.listStaff({ includeDeleted: true }),
    ...ranges.map((r) => bookingsRepo.countTable({ ...base, ...rangeBounds(r, now) })),
  ]);
  const staffById = new Map(staff.map((s) => [s._id, s]));
  return {
    rows: rows.map((b) =>
      toAdminBookingView(
        b,
        staffById.get(b.staffId) ?? { _id: b.staffId, name: 'Former staff', slug: 'former-staff' },
      ),
    ),
    total,
    page: query.page,
    pageSize: BOOKING_TABLE_PAGE_SIZE,
    counts: {
      today: counts[0] ?? 0,
      tomorrow: counts[1] ?? 0,
      week: counts[2] ?? 0,
      upcoming: counts[3] ?? 0,
      past: counts[4] ?? 0,
    },
  };
}
