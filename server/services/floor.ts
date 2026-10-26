import type { FloorResponse } from '../../shared/api/admin';
import { chairState } from '../../shared/lib/floor';
import type { BookingDocument } from '../../shared/schemas/booking';
import { shopDateOf, shopDayBounds } from '../../shared/lib/time';
import { bookingsRepo } from '../repos';
import { activeStaff } from './adminBookings';
import { workingRangesFor } from './availability';
import { toAdminBookingView, toStaffRef } from './bookingView';
import { staffPhotoMap } from './photosService';
import { loadScheduleData } from './scheduleData';

const DONE_SHOWN = 3;

/**
 * Shop, Today: one card per chair in chair order, who is coming up, what is done and today's
 * numbers. Every value comes from today's bookings; the clock is the server's.
 */
export async function floor(now: Date): Promise<FloorResponse> {
  const today = shopDateOf(now);
  const [data, bookings, photos] = await Promise.all([
    loadScheduleData(today, today),
    bookingsRepo.listBookingsBetween(shopDayBounds(today)),
    staffPhotoMap(),
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
    comingUp: comingUp.map(view),
    done: completed.slice(0, DONE_SHOWN).map(view),
    counts: {
      booked: live.length,
      done: completed.length,
      walkIns: live.filter((b) => b.source === 'walkIn').length,
      takingsCents: completed.reduce((sum, b) => sum + b.totalPriceCents, 0),
      inChairs: inChairIds.size,
      waiting: comingUp.filter((b) => b.arrivedAt).length,
    },
  };
}
