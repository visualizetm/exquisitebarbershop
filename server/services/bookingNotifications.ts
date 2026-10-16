import type { ClientSession } from 'mongodb';
import type { BookingView } from '../../shared/api/bookings';
import type { OutboxTemplate } from '../../shared/schemas/emailOutbox';
import type { ShopSettingsDocument } from '../../shared/schemas/shopSettings';
import { emailOutboxRepo } from '../repos';
import type { BookingEmailPayload, ShopSnapshot } from '../notifications/payload';

export function shopSnapshot(settings: ShopSettingsDocument): ShopSnapshot {
  const a = settings.address;
  return {
    name: settings.name,
    tagline: settings.tagline,
    addressLines: [a.line1, ...(a.line2 ? [a.line2] : []), `${a.city}, ${a.state} ${a.postalCode}`],
    phone: settings.phone,
    email: settings.email,
    fromName: settings.notifications.fromName,
    replyToEmail: settings.notifications.replyToEmail,
  };
}

export type BookingEvent = 'confirmed' | 'rescheduled' | 'cancelled';

const CUSTOMER_TEMPLATE: Record<BookingEvent, OutboxTemplate> = {
  confirmed: 'bookingConfirmed',
  rescheduled: 'bookingRescheduled',
  cancelled: 'bookingCancelled',
};
const OWNER_TEMPLATE: Record<BookingEvent, OutboxTemplate> = {
  confirmed: 'ownerNewBooking',
  rescheduled: 'ownerBookingRescheduled',
  cancelled: 'ownerBookingCancelled',
};

/**
 * Enqueues the customer message (when they gave an email) and the owner alert for
 * one booking event, inside the caller's transaction. Dedupe keys include the
 * booking's sequence so each reschedule gets exactly one message and a retry of
 * the same transaction never doubles up.
 */
export async function enqueueBookingNotifications(
  input: {
    event: BookingEvent;
    view: BookingView;
    settings: ShopSettingsDocument;
    managePath: string | null;
    previousStartAt: Date | null;
    cancelReason: string | null;
  },
  now: Date,
  session: ClientSession,
): Promise<string[]> {
  const ids: string[] = [];
  const base = {
    booking: input.view,
    shop: shopSnapshot(input.settings),
    previousStartAt: input.previousStartAt?.toISOString() ?? null,
    cancelReason: input.cancelReason,
  };
  const customerEmail = input.view.customer.email;
  if (customerEmail && input.settings.notifications.customerConfirmationEmail) {
    const payload: BookingEmailPayload = { ...base, managePath: input.managePath };
    const row = await emailOutboxRepo.enqueueOutboxMessage(
      {
        channel: 'email',
        to: customerEmail,
        template: CUSTOMER_TEMPLATE[input.event],
        payload,
        dedupeKey: `booking:${input.view.id}:${input.event}:v${input.view.sequence}:customer`,
        bookingId: input.view.id,
      },
      now,
      { session },
    );
    if (row) ids.push(row._id);
  }
  if (input.settings.notifications.ownerNewBookingEmail) {
    const payload: BookingEmailPayload = { ...base, managePath: null };
    const row = await emailOutboxRepo.enqueueOutboxMessage(
      {
        channel: 'email',
        to: input.settings.notifications.ownerAlertEmail,
        template: OWNER_TEMPLATE[input.event],
        payload,
        dedupeKey: `booking:${input.view.id}:${input.event}:v${input.view.sequence}:owner`,
        bookingId: input.view.id,
      },
      now,
      { session },
    );
    if (row) ids.push(row._id);
  }
  return ids;
}
