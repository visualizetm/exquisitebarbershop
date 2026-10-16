import { describe, expect, it } from 'vitest';
import { REFERENCE_CODE_ALPHABET } from '../../shared/lib/constants';
import {
  generateReferenceCode,
  isReferenceCode,
  normalizeReferenceCode,
  REFERENCE_CODE_PATTERN,
} from '../../shared/lib/referenceCode';

describe('reference codes', () => {
  it('alphabet has 32 symbols and no 0, O, 1 or I', () => {
    expect(REFERENCE_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(REFERENCE_CODE_ALPHABET).size).toBe(32);
    for (const banned of ['0', 'O', '1', 'I'])
      expect(REFERENCE_CODE_ALPHABET).not.toContain(banned);
  });

  it('generates codes matching the pattern', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateReferenceCode();
      expect(code).toMatch(REFERENCE_CODE_PATTERN);
      expect(isReferenceCode(code)).toBe(true);
    }
  });

  it('is deterministic for a given byte source', () => {
    const bytes = () => Uint8Array.from([0, 1, 2, 3, 31, 32, 255]);
    expect(generateReferenceCode(bytes)).toBe('ABC-D9A9');
  });

  it('normalizes human input', () => {
    expect(normalizeReferenceCode('kzt 7mq4')).toBe('KZT-7MQ4');
    expect(normalizeReferenceCode('KZT7MQ4')).toBe('KZT-7MQ4');
    expect(normalizeReferenceCode('KZT-7MQ4')).toBe('KZT-7MQ4');
    expect(normalizeReferenceCode('KZT-7MQ')).toBeNull();
    expect(normalizeReferenceCode('KZT-7MQ0')).toBeNull();
  });
});
