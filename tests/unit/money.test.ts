import { describe, expect, it } from 'vitest';
import { formatCents, parseDollarsToCents, priceLabel, sumCents } from '../../shared/lib/money';

describe('money', () => {
  it('formats whole dollars without cents', () => {
    expect(formatCents(2500)).toBe('$25');
    expect(formatCents(0)).toBe('$0');
    expect(formatCents(120000)).toBe('$1,200');
  });

  it('formats fractional dollars with two digits', () => {
    expect(formatCents(2550)).toBe('$25.50');
    expect(formatCents(2505)).toBe('$25.05');
  });

  it('rejects non-integer or negative cents', () => {
    expect(() => formatCents(25.5)).toThrow(RangeError);
    expect(() => formatCents(-1)).toThrow(RangeError);
  });

  it('labels starting prices', () => {
    expect(priceLabel({ priceCents: 7500, priceFrom: true })).toBe('From $75');
    expect(priceLabel({ priceCents: 3000, priceFrom: false })).toBe('$30');
  });

  it('sums validated amounts', () => {
    expect(sumCents([3000, 2000, 1500])).toBe(6500);
    expect(() => sumCents([3000, 1.5])).toThrow(RangeError);
  });

  it('parses dollar strings', () => {
    expect(parseDollarsToCents('25')).toBe(2500);
    expect(parseDollarsToCents('$25.5')).toBe(2550);
    expect(parseDollarsToCents('1,200.00')).toBe(120000);
    expect(parseDollarsToCents('abc')).toBeNull();
    expect(parseDollarsToCents('1.234')).toBeNull();
  });
});
