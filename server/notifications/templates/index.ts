import { publicEmail } from '../../lib/publicEmail';
import { buildIcs, bookingIcsUid } from '../../../shared/lib/ics';
import { formatCents } from '../../../shared/lib/money';
import { totalAfterDiscounts } from '../../../shared/lib/launchOffer';
import { formatUsPhone } from '../../../shared/lib/phone';
import { formatShopDateTime, formatShopTime } from '../../../shared/lib/time';
import type { OutboxTemplate } from '../../../shared/schemas/emailOutbox';
import type { Attachment, RenderedMessage } from '../channel';
import { bookingEmailPayloadSchema, type BookingEmailPayload } from '../payload';

export interface RenderEnv {
  appBaseUrl: string;
  now: Date;
}

interface Rendered {
  subject: string;
  text: string;
  html: string;
  attachments: Attachment[];
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A booking has one barber, so every price in an email is that barber's exact price, never "from"
 * (also for a booking stored before snapshots dropped the flag).
 */
function serviceLines(p: BookingEmailPayload): string[] {
  return p.booking.services.map(
    (s) => `${s.name}: ${formatCents(s.priceCents)} (${s.durationMinutes} min)`,
  );
}

/** "First online booking: -$10", one line per discount; none on most bookings. */
function discountLines(p: BookingEmailPayload): string[] {
  return p.booking.discounts.map((d) => `First online booking: -${formatCents(d.amountCents)}`);
}

function whenLine(p: BookingEmailPayload): string {
  const start = new Date(p.booking.startAt);
  const end = new Date(p.booking.endAt);
  return `${formatShopDateTime(start)} to ${formatShopTime(end)} (Eastern time)`;
}

function manageUrl(p: BookingEmailPayload, env: RenderEnv): string | null {
  return p.managePath ? `${env.appBaseUrl}${p.managePath}` : null;
}

function wrapHtml(title: string, bodyParagraphs: string[], p: BookingEmailPayload): string {
  const paragraphs = bodyParagraphs.map((x) => `<p>${x}</p>`).join('\n');
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>' + esc(title) + '</title></head>',
    '<body style="font-family: Archivo, \'Helvetica Neue\', Arial, sans-serif; line-height: 1.5; color: #111;">',
    `<h1 style="font-size: 20px;">${esc(title)}</h1>`,
    paragraphs,
    `<p style="color:#555; font-size: 13px;">${esc(p.shop.name)}<br>${p.shop.addressLines.map(esc).join('<br>')}<br>${esc(formatUsPhone(p.shop.phone))}</p>`,
    '</body></html>',
  ].join('\n');
}

function footerText(p: BookingEmailPayload): string {
  return [p.shop.name, ...p.shop.addressLines, formatUsPhone(p.shop.phone)].join('\n');
}

function icsAttachment(
  p: BookingEmailPayload,
  method: 'REQUEST' | 'CANCEL',
  env: RenderEnv,
): Attachment {
  const host = new URL(env.appBaseUrl).host;
  const url = manageUrl(p, env);
  const content = buildIcs({
    uid: bookingIcsUid(p.booking.id, host),
    sequence: p.booking.sequence,
    method,
    startAt: new Date(p.booking.startAt),
    endAt: new Date(p.booking.endAt),
    summary: `${p.shop.name}: ${p.booking.services.map((s) => s.name).join(', ')}`,
    description: [
      `With ${p.booking.staff.name}.`,
      `Reference ${p.booking.referenceCode}.`,
      ...(url ? [`Manage: ${url}`] : []),
    ].join(' '),
    location: p.shop.addressLines.join(', '),
    organizerName: p.shop.name,
    organizerEmail: publicEmail(p.shop.email),
    stamp: env.now,
    ...(url ? { url } : {}),
  });
  return {
    filename: method === 'CANCEL' ? 'cancelled.ics' : 'appointment.ics',
    contentType: 'text/calendar; method=' + method,
    content,
  };
}

function customerConfirmed(p: BookingEmailPayload, env: RenderEnv, rescheduled: boolean): Rendered {
  const title = rescheduled ? 'Your appointment has been moved' : 'Your appointment is booked';
  const url = manageUrl(p, env);
  const lines = [
    `Hi ${p.booking.customer.name},`,
    rescheduled
      ? `Your appointment at ${p.shop.name} now takes place on ${whenLine(p)} with ${p.booking.staff.name}.`
      : `You are booked at ${p.shop.name} on ${whenLine(p)} with ${p.booking.staff.name}.`,
    ...(rescheduled && p.previousStartAt
      ? [`It was previously ${formatShopDateTime(new Date(p.previousStartAt))}.`]
      : []),
    `Reference code: ${p.booking.referenceCode}`,
    'Services:',
    ...serviceLines(p).map((l) => `  ${l}`),
    ...discountLines(p),
    `Total: ${formatCents(totalAfterDiscounts(p.booking.totalPriceCents, p.booking.discounts))}`,
    ...(url ? [`Need to change it? Cancel or reschedule here: ${url}`] : []),
    'A calendar file is attached.',
    '',
    footerText(p),
  ];
  const htmlParas = [
    `Hi ${esc(p.booking.customer.name)},`,
    esc(lines[1] ?? ''),
    ...(rescheduled && p.previousStartAt
      ? [esc(`It was previously ${formatShopDateTime(new Date(p.previousStartAt))}.`)]
      : []),
    `<strong>Reference code: ${esc(p.booking.referenceCode)}</strong>`,
    `Services:<br>${serviceLines(p).map(esc).join('<br>')}`,
    ...discountLines(p).map(esc),
    `Total: ${esc(formatCents(totalAfterDiscounts(p.booking.totalPriceCents, p.booking.discounts)))}`,
    ...(url ? [`Need to change it? <a href="${esc(url)}">Cancel or reschedule</a>.`] : []),
    'A calendar file is attached.',
  ];
  return {
    subject: `${rescheduled ? 'Moved' : 'Booked'}: ${formatShopDateTime(new Date(p.booking.startAt))} at ${p.shop.name} (${p.booking.referenceCode})`,
    text: lines.join('\n'),
    html: wrapHtml(title, htmlParas, p),
    attachments: [icsAttachment(p, 'REQUEST', env)],
  };
}

function customerCancelled(p: BookingEmailPayload, env: RenderEnv): Rendered {
  const lines = [
    `Hi ${p.booking.customer.name},`,
    `Your appointment at ${p.shop.name} on ${whenLine(p)} with ${p.booking.staff.name} has been cancelled.`,
    `Reference code: ${p.booking.referenceCode}`,
    ...(p.cancelReason ? [`Reason: ${p.cancelReason}`] : []),
    `Book again any time at ${env.appBaseUrl}/book`,
    '',
    footerText(p),
  ];
  return {
    subject: `Cancelled: ${formatShopDateTime(new Date(p.booking.startAt))} at ${p.shop.name} (${p.booking.referenceCode})`,
    text: lines.join('\n'),
    html: wrapHtml(
      'Your appointment has been cancelled',
      [
        `Hi ${esc(p.booking.customer.name)},`,
        esc(lines[1] ?? ''),
        `<strong>Reference code: ${esc(p.booking.referenceCode)}</strong>`,
        ...(p.cancelReason ? [esc(`Reason: ${p.cancelReason}`)] : []),
        `Book again any time: <a href="${esc(env.appBaseUrl)}/book">${esc(env.appBaseUrl)}/book</a>`,
      ],
      p,
    ),
    attachments: [icsAttachment(p, 'CANCEL', env)],
  };
}

function ownerAlert(
  p: BookingEmailPayload,
  env: RenderEnv,
  kind: 'new' | 'cancelled' | 'rescheduled',
): Rendered {
  const verb =
    kind === 'new' ? 'New booking' : kind === 'cancelled' ? 'Booking cancelled' : 'Booking moved';
  const lines = [
    `${verb}: ${whenLine(p)} with ${p.booking.staff.name}${p.booking.staffRequested ? '' : ' (first available)'}.`,
    ...(kind === 'rescheduled' && p.previousStartAt
      ? [`Was: ${formatShopDateTime(new Date(p.previousStartAt))}`]
      : []),
    `Customer: ${p.booking.customer.name}, ${formatUsPhone(p.booking.customer.phone)}${p.booking.customer.email ? `, ${p.booking.customer.email}` : ''}`,
    `Reference: ${p.booking.referenceCode}`,
    'Services:',
    ...serviceLines(p).map((l) => `  ${l}`),
    ...discountLines(p),
    `Total: ${formatCents(totalAfterDiscounts(p.booking.totalPriceCents, p.booking.discounts))}`,
    ...(p.booking.notes ? [`Notes: ${p.booking.notes}`] : []),
    ...(p.cancelReason ? [`Reason: ${p.cancelReason}`] : []),
    `Dashboard: ${env.appBaseUrl}/admin`,
  ];
  return {
    subject: `${verb}: ${formatShopDateTime(new Date(p.booking.startAt))} with ${p.booking.staff.name} (${p.booking.referenceCode})`,
    text: lines.join('\n'),
    html: wrapHtml(verb, lines.map(esc), p),
    attachments:
      kind === 'cancelled' ? [icsAttachment(p, 'CANCEL', env)] : [icsAttachment(p, 'REQUEST', env)],
  };
}

/** Renders an outbox row into a message. Throws when the payload does not match the template. */
export function renderTemplate(
  template: OutboxTemplate,
  rawPayload: Record<string, unknown>,
  to: string,
  idempotencyKey: string,
  env: RenderEnv,
): RenderedMessage {
  const payload = bookingEmailPayloadSchema.parse(rawPayload);
  let rendered: Rendered;
  switch (template) {
    case 'bookingConfirmed':
      rendered = customerConfirmed(payload, env, false);
      break;
    case 'bookingRescheduled':
      rendered = customerConfirmed(payload, env, true);
      break;
    case 'bookingCancelled':
      rendered = customerCancelled(payload, env);
      break;
    case 'ownerNewBooking':
      rendered = ownerAlert(payload, env, 'new');
      break;
    case 'ownerBookingCancelled':
      rendered = ownerAlert(payload, env, 'cancelled');
      break;
    case 'ownerBookingRescheduled':
      rendered = ownerAlert(payload, env, 'rescheduled');
      break;
    case 'passwordReset':
      throw new Error('passwordReset is rendered by the auth module');
  }
  return { channel: 'email', to, idempotencyKey, ...rendered };
}
