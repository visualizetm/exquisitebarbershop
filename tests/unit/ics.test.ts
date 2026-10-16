import { describe, expect, it } from 'vitest';
import { bookingIcsUid, buildIcs, escapeIcsText, foldIcsLine } from '../../shared/lib/ics';

const base = {
  uid: bookingIcsUid('64a1f2c3d4e5f60718293a4b', 'example.com'),
  sequence: 1,
  method: 'REQUEST' as const,
  startAt: new Date('2026-07-15T13:00:00.000Z'), // 09:00 EDT
  endAt: new Date('2026-07-15T13:45:00.000Z'),
  summary: 'Exquisite: Cut, Beard',
  description: 'With Dee; reference ABC-DEFG, manage online',
  location: '3309 Edgmont Ave, Brookhaven, PA 19015',
  organizerName: 'Exquisite Barber & Beauty Lounge',
  organizerEmail: 'hello@example.com',
  stamp: new Date('2026-07-01T00:00:00.000Z'),
  url: 'https://example.com/manage?token=abc',
};

describe('ics', () => {
  it('produces a valid calendar with timezone data and local times', () => {
    const ics = buildIcs(base);
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('TZID:America/New_York');
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU');
    expect(ics).toContain('DTSTART;TZID=America/New_York:20260715T090000');
    expect(ics).toContain('DTEND;TZID=America/New_York:20260715T094500');
    expect(ics).toContain('DTSTAMP:20260701T000000Z');
    expect(ics).toContain('UID:booking-64a1f2c3d4e5f60718293a4b@example.com');
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('URL:https://example.com/manage?token=abc');
    // Every unfolded line stays within 75 octets.
    for (const line of lines) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
  });

  it('winter times use the standard offset', () => {
    const ics = buildIcs({
      ...base,
      startAt: new Date('2026-01-15T14:00:00.000Z'),
      endAt: new Date('2026-01-15T14:30:00.000Z'),
    });
    expect(ics).toContain('DTSTART;TZID=America/New_York:20260115T090000');
  });

  it('cancellations use METHOD:CANCEL and a cancelled status, and sequence rises', () => {
    const ics = buildIcs({ ...base, method: 'CANCEL', sequence: 3 });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SEQUENCE:3');
  });

  it('escapes text and folds long lines', () => {
    expect(escapeIcsText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    const folded = foldIcsLine(`DESCRIPTION:${'x'.repeat(200)}`);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toContain('x'.repeat(200));
    expect(foldIcsLine('short')).toBe('short');
  });
});
