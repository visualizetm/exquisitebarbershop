/**
 * Masks personal data before it reaches a log line. Logs are searched and kept
 * by Vercel, so an email or phone never appears in one whole.
 */
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
// Seven or more digits with optional separators: US phone numbers in any common shape.
const PHONE = /\(?\+?\d[\d\s().-]{5,}\d/g;

export function maskEmail(email: string): string {
  return email.replace(EMAIL, (_m, first: string, domain: string) => `${first}***@${domain}`);
}

export function maskPhone(text: string): string {
  return text.replace(PHONE, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 7) return match;
    return `***${digits.slice(-2)}`;
  });
}

export function maskText(text: string): string {
  return maskPhone(maskEmail(text));
}

/** Walks any log payload and masks every string in it. */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[deep]';
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}
