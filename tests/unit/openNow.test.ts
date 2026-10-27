import { describe, expect, it } from 'vitest';
import {
  chairGate,
  firstAvailableGate,
  gateText,
  isOpenAt,
  opensLabel,
} from '../../shared/lib/openNow';

/* The clock is frozen at 9:10 PM in the shop (EDT, UTC-4) on Monday, October 26, 2026. */
const NOW = new Date('2026-10-27T01:10:00.000Z');
const at = (iso: string) => new Date(iso);
const span = (a: string, b: string) => ({ start: at(a), end: at(b) });
/* Tuesday 10 AM to 7 PM in the shop. */
const TUE = span('2026-10-27T14:00:00.000Z', '2026-10-27T23:00:00.000Z');
const MIDDAY = at('2026-10-27T18:14:00.000Z');

describe('the hours rule for NOW and the line', () => {
  it('knows when the shop is open', () => {
    expect(isOpenAt([TUE], MIDDAY)).toBe(true);
    expect(isOpenAt([TUE], NOW)).toBe(false);
    expect(isOpenAt([], MIDDAY)).toBe(false);
  });

  it('closed shop: says when it opens next, and never offers a line', () => {
    const gate = chairGate({ name: 'Drew', ranges: [] }, [], NOW, TUE.start);
    expect(gate).toEqual({ kind: 'closed', opensAt: TUE.start });
    expect(gateText(gate)).toBe('The shop is closed right now. Opens Tue 10 AM.');
    expect(gateText({ kind: 'closed', opensAt: null })).toBe('The shop is closed right now.');
    expect(opensLabel(at('2026-10-27T14:30:00.000Z'))).toBe('Tue 10:30 AM');
  });

  it('open shop: the barber must be in today and not finished', () => {
    expect(chairGate({ name: 'Drew', ranges: [] }, [TUE], MIDDAY, null)).toEqual({
      kind: 'off',
      name: 'Drew',
    });
    const morning = span('2026-10-27T14:00:00.000Z', '2026-10-27T17:00:00.000Z');
    expect(chairGate({ name: 'Drew', ranges: [morning] }, [TUE], MIDDAY, null)).toEqual({
      kind: 'done',
      name: 'Drew',
    });
    expect(chairGate({ name: 'Drew', ranges: [TUE] }, [TUE], MIDDAY, null)).toEqual({
      kind: 'open',
    });
    expect(gateText({ kind: 'off', name: 'Drew' })).toBe('Drew is off today.');
    expect(gateText({ kind: 'done', name: 'Drew' })).toBe('Drew is done for the day.');
  });

  it('first available needs the shop open and at least one barber in', () => {
    const drew = { name: 'Drew', ranges: [TUE] };
    const lee = { name: 'Lee', ranges: [] };
    expect(firstAvailableGate([drew, lee], [TUE], MIDDAY, null)).toEqual({ kind: 'open' });
    expect(firstAvailableGate([lee], [TUE], MIDDAY, null)).toEqual({ kind: 'nobody' });
    expect(firstAvailableGate([drew], [TUE], NOW, TUE.start)).toEqual({
      kind: 'closed',
      opensAt: TUE.start,
    });
    expect(gateText({ kind: 'nobody' })).toBe('Nobody is in right now.');
    expect(gateText({ kind: 'open' })).toBeNull();
  });
});
