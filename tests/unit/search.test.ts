import { describe, expect, it } from 'vitest';
import { classifySearch, nameKeyOf } from '../../shared/lib/search';

describe('nameKeyOf', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(nameKeyOf('  JOSÉ   Pérez ')).toBe('jose perez');
    expect(nameKeyOf('Zoë-Ann')).toBe('zoe ann');
    expect(nameKeyOf("D'Andre")).toBe('d andre');
  });
});

describe('classifySearch', () => {
  it('reads digits in any format as a phone, with a country code dropped', () => {
    expect(classifySearch('(215) 555-0100')).toEqual({ kind: 'phone', digits: '2155550100' });
    expect(classifySearch('+1 215 555 0100')).toEqual({ kind: 'phone', digits: '2155550100' });
    expect(classifySearch('215.555.0100')).toEqual({ kind: 'phone', digits: '2155550100' });
  });

  it('accepts the last four digits', () => {
    expect(classifySearch('0100')).toEqual({ kind: 'phone', digits: '0100' });
  });

  it('keeps fewer than four digits and anything with letters as text', () => {
    expect(classifySearch('215')).toEqual({ kind: 'text', key: '215' });
    expect(classifySearch('KZT-7MQ4')).toEqual({ kind: 'text', key: 'kzt 7mq4' });
    expect(classifySearch('Marcus')).toEqual({ kind: 'text', key: 'marcus' });
  });

  it('treats blank input as empty', () => {
    expect(classifySearch('   ')).toEqual({ kind: 'empty' });
    expect(classifySearch('---')).toEqual({ kind: 'empty' });
  });
});
