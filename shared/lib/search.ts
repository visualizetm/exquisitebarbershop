/**
 * Search helpers shared by the server (matching) and the dashboard (what the box says).
 * A name key is the name with accents and case removed, so "Jose", "JOSÉ" and "josé" are one key
 * and a prefix of the key finds all of them.
 */

export function nameKeyOf(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export type SearchKind =
  { kind: 'empty' } | { kind: 'phone'; digits: string } | { kind: 'text'; key: string };

/**
 * What the owner typed. A query made only of digits and phone punctuation, with at least four
 * digits, is a phone number in any format (the last four digits are enough). Everything else
 * is a name or a booking code; the caller tries both.
 */
export function classifySearch(input: string): SearchKind {
  const trimmed = input.trim();
  if (trimmed === '') return { kind: 'empty' };
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 4 && /^[\d\s()+.-]+$/.test(trimmed)) {
    // A leading US country code is dropped so "1 215 555 0100" and "215-555-0100" agree.
    const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    return { kind: 'phone', digits: national.slice(0, 10) };
  }
  const key = nameKeyOf(trimmed);
  return key === '' ? { kind: 'empty' } : { kind: 'text', key };
}
