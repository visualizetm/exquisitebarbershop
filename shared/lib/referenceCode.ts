import { REFERENCE_CODE_ALPHABET } from './constants';

/**
 * Booking reference codes: 3 letters or digits, a hyphen, then 4 more, drawn from an
 * alphabet without 0, O, 1 or I. Example: "KZT-7MQ4". 32^7 possibilities.
 */

export const REFERENCE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{4}$/;

export type RandomBytes = (length: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = (length) => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

export function generateReferenceCode(randomBytes: RandomBytes = defaultRandomBytes): string {
  const alphabetSize = REFERENCE_CODE_ALPHABET.length; // 32, so a byte & 31 is uniform
  const bytes = randomBytes(7);
  let raw = '';
  for (let i = 0; i < 7; i += 1) {
    const byte = bytes[i] ?? 0;
    raw += REFERENCE_CODE_ALPHABET.charAt(byte % alphabetSize);
  }
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

/** Accepts user input like "kzt 7mq4" or "KZT7MQ4" and returns the canonical form, or null. */
export function normalizeReferenceCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length !== 7) return null;
  const candidate = `${compact.slice(0, 3)}-${compact.slice(3)}`;
  return REFERENCE_CODE_PATTERN.test(candidate) ? candidate : null;
}

export function isReferenceCode(value: string): boolean {
  return REFERENCE_CODE_PATTERN.test(value);
}
