import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../../server/notifications/templates';
import type { BookingEmailPayload } from '../../server/notifications/payload';

const payload: BookingEmailPayload = {
  booking: {
    id: '64a1f2c3d4e5f60718293a4b',
    referenceCode: 'KZT-7MQ4',
    status: 'confirmed',
    source: 'online',
    staff: { id: '64a1f2c3d4e5f60718293a4c', name: 'Drew', slug: 'drew' },
    staffRequested: true,
    services: [
      {
        serviceId: '64a1f2c3d4e5f60718293a4d',
        name: 'Haircut',
        group: 'Barber',
        priceCents: 3000,
        priceFrom: false,
        durationMinutes: 30,
      },
      {
        serviceId: '64a1f2c3d4e5f60718293a4e',
        name: 'Lineup',
        group: 'Barber',
        priceCents: 1000,
        priceFrom: true,
        durationMinutes: 15,
      },
    ],
    startAt: '2026-07-15T13:00:00.000Z',
    endAt: '2026-07-15T13:45:00.000Z',
    durationMinutes: 45,
    totalPriceCents: 4000,
    customer: { name: 'Sam <Customer>', phone: '+12155550123', email: 'sam@example.com' },
    notes: 'Scissors only',
    sequence: 2,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  shop: {
    name: 'Exquisite Barber & Beauty Lounge',
    tagline: 'Gifted Hands',
    addressLines: ['3309 Edgmont Ave', 'Brookhaven, PA 19015'],
    phone: '+16106090786',
    email: 'hello@example.com',
    fromName: 'Exquisite',
    replyToEmail: null,
  },
  managePath: '/manage?token=v1.abc.def',
  previousStartAt: '2026-07-14T13:00:00.000Z',
  cancelReason: 'Running late',
};
const env = { appBaseUrl: 'https://example.com', now: new Date('2026-07-01T00:00:00.000Z') };

describe('email templates', () => {
  it('customer confirmation has the manage link, totals, times in shop time and an ics attachment', () => {
    const m = renderTemplate('bookingConfirmed', payload, 'sam@example.com', 'msg1', env);
    expect(m.subject).toContain('Wed, Jul 15 at 9:00 AM');
    expect(m.subject).toContain('KZT-7MQ4');
    expect(m.text).toContain('https://example.com/manage?token=v1.abc.def');
    // The booking has one barber, so the price is exact even for a line stored with the old
    // "from" flag: no "from", no starting price note.
    expect(m.text).toContain(': $10 (');
    expect(m.text).not.toMatch(/from \$/i);
    expect(m.text).not.toContain('starting price');
    expect(m.text).toContain('Total: $40\n');
    expect(m.html).toContain('&lt;Customer&gt;');
    expect(m.html).toContain('href="https://example.com/manage?token=v1.abc.def"');
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments[0]?.filename).toBe('appointment.ics');
    expect(m.attachments[0]?.content).toContain('METHOD:REQUEST');
    expect(m.attachments[0]?.content).toContain('SEQUENCE:2');
    expect(m.to).toBe('sam@example.com');
    expect(m.idempotencyKey).toBe('msg1');
  });

  it('the calendar file names an organizer only when the shop has a real email', () => {
    const real = renderTemplate('bookingConfirmed', payload, 'sam@example.com', 'm1', env);
    expect(real.attachments[0]?.content).toContain('ORGANIZER;CN=Exquisite Barber & Beauty Lounge');
    expect(real.attachments[0]?.content).toContain('mailto:hello@example.com');
    const stand = {
      ...payload,
      shop: { ...payload.shop, email: 'hello@exquisitebarberbeauty.com' },
    };
    const none = renderTemplate('bookingConfirmed', stand, 'sam@example.com', 'm2', env);
    expect(none.attachments[0]?.content).not.toContain('ORGANIZER');
    expect(none.attachments[0]?.content).not.toContain('exquisitebarberbeauty.com');
  });

  it('reschedule mentions the previous time; cancel uses METHOD:CANCEL and the reason', () => {
    const r = renderTemplate('bookingRescheduled', payload, 'sam@example.com', 'msg2', env);
    expect(r.subject.startsWith('Moved:')).toBe(true);
    expect(r.text).toContain('previously Tue, Jul 14 at 9:00 AM');
    const c = renderTemplate(
      'bookingCancelled',
      { ...payload, managePath: null },
      'sam@example.com',
      'msg3',
      env,
    );
    expect(c.subject.startsWith('Cancelled:')).toBe(true);
    expect(c.text).toContain('Reason: Running late');
    expect(c.text).toContain('https://example.com/book');
    expect(c.attachments[0]?.filename).toBe('cancelled.ics');
    expect(c.attachments[0]?.content).toContain('METHOD:CANCEL');
  });

  it('owner alerts carry customer contact, notes and the dashboard link', () => {
    for (const template of [
      'ownerNewBooking',
      'ownerBookingCancelled',
      'ownerBookingRescheduled',
    ] as const) {
      const m = renderTemplate(
        template,
        { ...payload, managePath: null },
        'owner@example.com',
        'o1',
        env,
      );
      expect(m.text).toContain('(215) 555-0123');
      expect(m.text).toContain('Notes: Scissors only');
      expect(m.text).toContain('https://example.com/admin');
      expect(m.text).not.toContain('/manage?token=');
    }
  });

  it('no em dashes in any rendered message', () => {
    for (const template of [
      'bookingConfirmed',
      'bookingRescheduled',
      'bookingCancelled',
      'ownerNewBooking',
      'ownerBookingCancelled',
      'ownerBookingRescheduled',
    ] as const) {
      const m = renderTemplate(template, payload, 'x@example.com', 'k', env);
      expect(m.subject + m.text + m.html).not.toContain('—');
    }
  });

  it('rejects a payload that does not fit and refuses auth templates', () => {
    expect(() =>
      renderTemplate('bookingConfirmed', { nope: true }, 'x@example.com', 'k', env),
    ).toThrow();
    expect(() => renderTemplate('passwordReset', payload, 'x@example.com', 'k', env)).toThrow();
  });
});
