import { describe, expect, it } from 'vitest';
import { heroLines } from '../../shared/lib/hero';
import { DEFAULT_HERO, heroSchema } from '../../shared/schemas/shopSettings';

describe('the hero copy', () => {
  it('reads today’s headline as four lines with the red word on its own line', () => {
    expect(heroLines(DEFAULT_HERO)).toEqual([
      { text: 'Gifted', accent: false },
      { text: 'hands.', accent: false },
      { text: 'Exquisite', accent: true },
      { text: 'cuts.', accent: false },
    ]);
  });

  it('pairs words up past four, so the hero never grows past four lines', () => {
    const lines = heroLines({
      headline: 'Sharp fades and clean beards every single day',
      redWord: 'clean',
    });
    expect(lines.length).toBeLessThanOrEqual(4);
    expect(lines.map((l) => l.text).join(' ')).toBe(
      'Sharp fades and clean beards every single day',
    );
    expect(lines.filter((l) => l.accent)).toHaveLength(1);
  });

  it('refuses a red word that is not in the headline, and a headline over 48 characters', () => {
    expect(heroSchema.safeParse({ ...DEFAULT_HERO, redWord: 'Brookhaven' }).success).toBe(false);
    expect(
      heroSchema.safeParse({
        ...DEFAULT_HERO,
        headline: 'A headline that is far too long to fit the hero at all',
      }).success,
    ).toBe(false);
    expect(heroSchema.safeParse({ ...DEFAULT_HERO, redWord: 'cuts' }).success).toBe(true);
  });
});
