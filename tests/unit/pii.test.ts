import { describe, expect, it } from 'vitest';
import { maskEmail, maskPhone, scrub } from '../../server/lib/pii';

describe('pii masking', () => {
  it('keeps one letter and the domain of an email', () => {
    expect(maskEmail('jordan.smith@example.com')).toBe('j***@example.com');
    expect(maskEmail('Sent to jordan@example.com and kim@shop.co')).toBe(
      'Sent to j***@example.com and k***@shop.co',
    );
  });

  it('keeps the last two digits of a phone number in any shape', () => {
    expect(maskPhone('(610) 555-0142')).toBe('***42');
    expect(maskPhone('+16105550142')).toBe('***42');
    expect(maskPhone('call 610-555-0199 today')).toBe('call ***99 today');
    // Short numbers (a year, a price) are left alone.
    expect(maskPhone('booked 2026 for $120')).toBe('booked 2026 for $120');
  });

  it('scrubs every string inside a log payload', () => {
    expect(
      scrub({
        to: 'amy@example.com',
        nested: { note: 'phone 2155550123', list: ['x@y.org', 7] },
        ok: true,
      }),
    ).toEqual({
      to: 'a***@example.com',
      nested: { note: 'phone ***23', list: ['x***@y.org', 7] },
      ok: true,
    });
  });
});
