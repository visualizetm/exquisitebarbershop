/**
 * Money helpers. Prices are integer cents everywhere in storage and transport.
 * Formatting only happens at the rendering edge.
 */

export function assertCents(cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError(`Expected a non-negative integer number of cents, got ${cents}`);
  }
}

/** Formats cents as US dollars. Whole dollars drop the cents: 2500 -> "$25", 2550 -> "$25.50". */
export function formatCents(cents: number): string {
  assertCents(cents);
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  const whole = dollars.toLocaleString('en-US');
  if (remainder === 0) return `$${whole}`;
  return `$${whole}.${remainder.toString().padStart(2, '0')}`;
}

/** Customer-facing price label. Services with variable pricing read "From $25". */
export function priceLabel(input: { priceCents: number; priceFrom: boolean }): string {
  const base = formatCents(input.priceCents);
  return input.priceFrom ? `From ${base}` : base;
}

/** Sums a list of cent amounts, validating each. */
export function sumCents(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => {
    assertCents(amount);
    return total + amount;
  }, 0);
}

/** Parses a dollars string like "25", "25.5" or "$25.50" into cents. Returns null when invalid. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
