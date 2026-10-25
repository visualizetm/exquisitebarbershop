import { DateTime } from 'luxon';
import { SHOP_TIMEZONE } from './constants';

/**
 * Minimal, valid iCalendar output for one appointment. Pure so the server can
 * attach it to emails and the browser can offer the same file for download.
 *
 * UID is stable per booking; SEQUENCE rises on every reschedule so calendar apps
 * replace the earlier event instead of adding a second one.
 */
export interface IcsEventInput {
  uid: string;
  sequence: number;
  method: 'REQUEST' | 'CANCEL';
  startAt: Date;
  endAt: Date;
  summary: string;
  description: string;
  location: string;
  organizerName: string;
  /** Left out while the shop has no real mailbox: the file then carries no ORGANIZER line. */
  organizerEmail?: string;
  /** When the file was produced. */
  stamp: Date;
  url?: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Local wall-clock form for DTSTART;TZID=... values. */
function localStamp(instant: Date): string {
  const dt = DateTime.fromJSDate(instant, { zone: SHOP_TIMEZONE });
  return `${dt.year}${pad(dt.month)}${pad(dt.day)}T${pad(dt.hour)}${pad(dt.minute)}${pad(dt.second)}`;
}

/** UTC form for DTSTAMP. */
function utcStamp(instant: Date): string {
  const dt = DateTime.fromJSDate(instant, { zone: 'utc' });
  return `${dt.year}${pad(dt.month)}${pad(dt.day)}T${pad(dt.hour)}${pad(dt.minute)}${pad(dt.second)}Z`;
}

/** RFC 5545 text escaping. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets with CRLF plus a single space, per RFC 5545. */
export function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + size > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  if (current) parts.push(current);
  return parts.join('\r\n ');
}

/** America/New_York rules since 2007: second Sunday of March to first Sunday of November. */
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${SHOP_TIMEZONE}`,
  'X-LIC-LOCATION:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:20070311T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:20071104T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function buildIcs(input: IcsEventInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Exquisite Barber & Beauty Lounge//Booking//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${input.method}`,
    ...VTIMEZONE,
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${utcStamp(input.stamp)}`,
    `DTSTART;TZID=${SHOP_TIMEZONE}:${localStamp(input.startAt)}`,
    `DTEND;TZID=${SHOP_TIMEZONE}:${localStamp(input.endAt)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    `DESCRIPTION:${escapeIcsText(input.description)}`,
    `LOCATION:${escapeIcsText(input.location)}`,
    ...(input.organizerEmail
      ? [`ORGANIZER;CN=${escapeIcsText(input.organizerName)}:mailto:${input.organizerEmail}`]
      : []),
    `STATUS:${input.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(input.url ? [`URL:${input.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** UID that stays the same for the life of a booking. */
export function bookingIcsUid(bookingId: string, host: string): string {
  return `booking-${bookingId}@${host}`;
}
