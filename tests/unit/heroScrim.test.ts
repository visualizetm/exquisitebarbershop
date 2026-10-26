import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The red "Exquisite" line over the hero photo (D12-80). Red text on a photo or on ink is
 * --red-on-dark, and --scrim-photo is dark enough that the line keeps 4.5:1 over the brightest pixel
 * of the shop's hero photo under it. Those pixels were measured on the demo build (seed/photos/
 * exq-01-hero.webp, crop 85% 30%, text hidden) at 390 and 768 and backed out of the 80% scrim the
 * capture used. A new hero photo or crop needs a new measurement.
 */
const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const pages = readFileSync('src/styles/pages.css', 'utf8');

const PHOTO_UNDER_LINE: Record<string, [number, number, number]> = {
  '390': [222, 187, 162],
  '768': [242, 217, 192],
};

function hex(name: string): [number, number, number] {
  const match = new RegExp(`--${name}:\\s*#([0-9a-f]{6});`, 'i').exec(tokens);
  if (!match?.[1]) throw new Error(`no --${name}`);
  const h = match[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(rgb: readonly number[]): number {
  const [r = 0, g = 0, b = 0] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function scrimAlpha(): number {
  const match = /--scrim-photo:\s*color-mix\(in srgb, var\(--ink\) (\d+)%, transparent\);/.exec(
    tokens,
  );
  if (!match?.[1]) throw new Error('no --scrim-photo');
  return Number(match[1]) / 100;
}

describe('the hero red line on the photo', () => {
  it('is the red for dark grounds: the photo band is .exq-dark and its accent text is --red-on-dark', () => {
    expect(hex('red-on-dark')).toEqual([0xff, 0x54, 0x70]);
    const dark = tokens.slice(
      tokens.indexOf('.exq-dark {'),
      tokens.indexOf('}', tokens.indexOf('.exq-dark {')),
    );
    expect(dark).toContain('--accent-text: var(--red-on-dark);');
    expect(pages).toMatch(
      /\.exq-lines__text\[data-accent='true'\] \{\s*color: var\(--accent-text\);/,
    );
    // Nothing in the hero rules paints text with the paper red directly.
    const hero = pages.slice(
      pages.indexOf('/* Home: the hero'),
      pages.indexOf('/* Home: sections'),
    );
    expect(hero).not.toMatch(/var\(--red\)/);
  });

  it('keeps 4.5:1 over the brightest photo pixel under the line at 390 and 768', () => {
    const alpha = scrimAlpha();
    const ink = hex('ink');
    const red = hex('red-on-dark');
    for (const [width, photo] of Object.entries(PHOTO_UNDER_LINE)) {
      const ground = photo.map((c, i) => Math.round(alpha * (ink[i] ?? 0) + (1 - alpha) * c));
      expect(contrast(red, ground), width).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is no darker than it needs to be: one point less fails at 768', () => {
    const alpha = scrimAlpha() - 0.01;
    const ink = hex('ink');
    const ground = (PHOTO_UNDER_LINE['768'] ?? [0, 0, 0]).map((c, i) =>
      Math.round(alpha * (ink[i] ?? 0) + (1 - alpha) * c),
    );
    expect(contrast(hex('red-on-dark'), ground)).toBeLessThan(4.5);
  });
});
