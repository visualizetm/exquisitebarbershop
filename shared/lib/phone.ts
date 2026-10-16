/**
 * Phone numbers are stored in E.164 (+1XXXXXXXXXX). The shop only serves US
 * customers, so a bare 10 digit number is treated as US.
 */

export const E164_US_PATTERN = /^\+1[2-9]\d{2}[2-9]\d{6}$/;

/** Returns E.164 or null when the input is not a valid US number. */
export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let national: string;
  if (digits.length === 10) national = digits;
  else if (digits.length === 11 && digits.startsWith('1')) national = digits.slice(1);
  else return null;
  const candidate = `+1${national}`;
  return E164_US_PATTERN.test(candidate) ? candidate : null;
}

/** "+12125551234" -> "(212) 555-1234". Non-E.164 input is returned unchanged. */
export function formatUsPhone(e164: string): string {
  if (!E164_US_PATTERN.test(e164)) return e164;
  const n = e164.slice(2);
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}
