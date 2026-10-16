import { describe, expect, it } from 'vitest';
import { formatUsPhone, normalizeUsPhone } from '../../shared/lib/phone';
import { phoneSchema } from '../../shared/schemas/common';

describe('phones', () => {
  it('normalizes common US formats to E.164', () => {
    expect(normalizeUsPhone('(215) 555-0123')).toBe('+12155550123');
    expect(normalizeUsPhone('215.555.0123')).toBe('+12155550123');
    expect(normalizeUsPhone('1 215 555 0123')).toBe('+12155550123');
    expect(normalizeUsPhone('+1 215 555 0123')).toBe('+12155550123');
  });

  it('rejects invalid numbers', () => {
    expect(normalizeUsPhone('555-0123')).toBeNull();
    expect(normalizeUsPhone('(015) 555-0123')).toBeNull();
    expect(normalizeUsPhone('+44 20 7946 0958')).toBeNull();
  });

  it('formats for display', () => {
    expect(formatUsPhone('+12155550123')).toBe('(215) 555-0123');
    expect(formatUsPhone('nonsense')).toBe('nonsense');
  });

  it('phoneSchema transforms and reports a friendly error', () => {
    expect(phoneSchema.parse('215-555-0123')).toBe('+12155550123');
    const result = phoneSchema.safeParse('12345');
    expect(result.success).toBe(false);
  });
});
