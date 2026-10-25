import { describe, expect, it } from 'vitest';
import { isValidSlug, slugify } from '../../shared/lib/slug';

describe('slugs', () => {
  it('slugifies names', () => {
    expect(slugify('Sam  Rivera!')).toBe('sam-rivera');
    expect(slugify('  Tré  ')).toBe('tre');
    expect(slugify('Cuts & Shaves')).toBe('cuts-and-shaves');
    expect(slugify('---')).toBe('');
  });

  it('caps the length at the slug maximum', () => {
    expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(40);
  });

  it('validates slugs and rejects reserved words', () => {
    expect(isValidSlug('dontrise')).toBe(true);
    expect(isValidSlug('dee-2')).toBe(true);
    expect(isValidSlug('Sam')).toBe(false);
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('any')).toBe(false);
    expect(isValidSlug('admin')).toBe(false);
    expect(isValidSlug('bad--slug')).toBe(false);
  });
});
