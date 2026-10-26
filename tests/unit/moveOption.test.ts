import { describe, expect, it } from 'vitest';
import { optionLabel } from '../../src/admin/panels/moveOption';

describe('the resolver move option label', () => {
  const drew = { staffId: 'd', staffName: 'Drew', totalPriceCents: 4000, durationMinutes: 45 };

  it('shows the chair and what the booking costs there', () => {
    expect(optionLabel({ durationMinutes: 45 }, drew)).toBe('Drew, $40');
  });

  it('adds the length when it changes', () => {
    expect(optionLabel({ durationMinutes: 75 }, drew)).toBe('Drew, $40, 45 min');
    expect(
      optionLabel(
        { durationMinutes: 45 },
        { staffId: 'o', staffName: 'Dontrise', totalPriceCents: 5000, durationMinutes: 75 },
      ),
    ).toBe('Dontrise, $50, 75 min');
  });
});
