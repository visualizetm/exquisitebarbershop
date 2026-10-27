import type { FloorResponse } from '../../shared/api/admin';
import { walkInViewSchema } from '../../shared/api/line';
import { chairState } from '../../shared/lib/floor';
import type { BookingDocument } from '../../shared/schemas/booking';
import { shopDateOf, shopDayBounds } from '../../shared/lib/time';
import { bookingsRepo } from '../repos';
import { activeStaff } from './adminBookings';
import { workingRangesFor } from './availability';
import { toAdminBookingView, toStaffRef } from './bookingView';
import { staffPhotoMap } from './photosService';
import { lineView } from './line';
import { loadScheduleData } from './scheduleData';

const DONE_SHOWN = 3;

/**
 * Shop, Today: one card per chair in chair order, who is coming up, what is done and today's
 * numbers. Every value comes from today's bookings; the clock is the server's.
 */
export async function floor(now: Date): Promise<FloorResponse> {
  const today = shopDateOf(now);
  const [data, bookings, photos, line] = await Promise.all([
    loadScheduleData(today, today),
    bookingsRepo.listBookingsBetween(shopDayBounds(today)),
    staffPhotoMap(),
    lineView(now),
  ]);
  const staffById = new Map(data.staff.map((s) => [s._id, s]));
  const view = (b: BookingDocument) => {
    const s = staffById.get(b.staffId);
    return toAdminBookingView(b, s ?? { _id: b.staffId, name: 'Former staff', slug: '' });
  };
  const asFloor = (b: BookingDocument) => ({ ...b, id: b._id, startedAt: b.startedAt ?? null });

  const inChairIds = new Set<string>();
  const chairs = activeStaff(data.staff).map((s) => {
    const mine = bookings.filter((b) => b.staffId === s._id).map(asFloor);
    const state = chairState({
      bookings: mine,
      working: workingRangesFor(s._id, today, data.source).ranges.length > 0,
      instagramOnly: !s.acceptsOnlineBooking && s.instagramHandle !== null,
      now,
    });
    if (state.current) inChairIds.add(state.current._id);
    // A free chair offers the first person in the line it can take right now.
    const next =
      state.kind === 'free'
        ? line.line.find(
            (w) =>
              (w.staffId === null || w.staffId === s._id) &&
              w.options.some((o) => o.staffId === s._id && o.estimate.kind === 'free'),
          )
        : undefined;
    return {
      staff: toStaffRef(s),
      photo: photos.get(s._id) ?? null,
      specialty: s.specialty,
      kind: state.kind,
      current: state.current ? view(state.current) : null,
      next: state.next ? view(state.next) : null,
      window: state.window
        ? { startAt: state.window.startAt.toISOString(), endAt: state.window.endAt.toISOString() }
        : null,
      seatWalkIn: next ? { id: next.id, position: next.position, name: next.name } : null,
    };
  });

  const comingUp = bookings
    .filter((b) => b.status === 'confirmed' && !b.startedAt && !inChairIds.has(b._id))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const completed = bookings
    .filter((b) => b.status === 'completed')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const live = bookings.filter((b) => b.status !== 'cancelled');

  return {
    date: today,
    now: now.toISOString(),
    chairs,
    line: line.line.map((w) => walkInViewSchema.parse(w)),
    comingUp: comingUp.map(view),
    done: completed.slice(0, DONE_SHOWN).map(view),
    counts: {
      booked: live.length,
      done: completed.length,
      walkIns: live.filter((b) => b.source === 'walkIn').length,
      takingsCents: completed.reduce((sum, b) => sum + b.totalPriceCents, 0),
      inChairs: inChairIds.size,
      waiting: line.line.length + comingUp.filter((b) => b.arrivedAt).length,
    },
  };
}
