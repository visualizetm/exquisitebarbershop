import { createContext, useContext } from 'react';
import type { AdminBookingView } from '@shared/api/admin';

export interface NewBookingPrefill {
  staffId?: string;
  /** An ISO instant, for example from a click on the schedule grid. */
  startAt?: string;
  /** A walk-in: the flow opens on the Time step with NOW in view. */
  source?: 'phone' | 'walkIn';
  /** Move an existing booking to another barber (starts on the Barber step, service fixed). */
  move?: AdminBookingView;
  /** Give an existing booking a new time (starts on the Time step). */
  reschedule?: AdminBookingView;
}

/**
 * What any screen can ask the dashboard shell to open. The shell owns the side panels so that
 * a booking, a new booking or a resolver opens the same way from the overview, the schedule
 * and the search. `version` goes up after every change so lists refetch.
 */
export interface QuickApi {
  openNewBooking: (prefill?: NewBookingPrefill) => void;
  openBooking: (id: string) => void;
  /** Block time on one chair (a break, or time off). */
  openBlock: (options?: { staffId?: string; kind?: 'block' | 'timeOff' }) => void;
  /** Mark a barber out for a day, with the resolver for booked clients. */
  openBarberOut: (staffId?: string) => void;
  openAnnouncement: () => void;
  /** Opens the resolver for an alert from the overview strip. */
  openAlert: (id: string) => void;
  /** Closes the booking panel (and leaves /admin/bookings/:id if the URL opened it). */
  closeBooking: () => void;
  version: number;
  changed: () => void;
}

export const QuickContext = createContext<QuickApi | null>(null);

export function useQuick(): QuickApi {
  const value = useContext(QuickContext);
  if (!value) throw new Error('useQuick must be used inside the dashboard shell');
  return value;
}
