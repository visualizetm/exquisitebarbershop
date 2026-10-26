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

/**
 * Worst (brightest) pixel of the shop's hero photo under each text box (label, every title line,
 * the sub line and the info row), measured on the demo build with the text hidden (scratchpad
 * hero-contrast-13a.mjs) as it shows through the gradient scrim (strong 90% to 78% of the height,
 * light 62% at the top). A new photo, crop or gradient needs a new measurement.
 */
const MEASURED: Record<string, { red: number; white: number }> = {
  '390': { red: 5.08, white: 10.6 },
  '768': { red: 4.9, white: 8.92 },
  // At 1280 the photo stands in its own column: the text is on plain ink.
  '1280': { red: 6.07, white: 18.88 },
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

function scrimAlpha(name: 'strong' | 'light'): number {
  const match = new RegExp(
    `--scrim-photo-${name}:\\s*color-mix\\(in srgb, var\\(--ink\\) (\\d+)%, transparent\\);`,
  ).exec(tokens);
  if (!match?.[1]) throw new Error(`no --scrim-photo-${name}`);
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

  it('is a directional gradient: strong behind the text, lighter over the rest', () => {
    const strong = scrimAlpha('strong');
    const light = scrimAlpha('light');
    expect(strong).toBeGreaterThan(light);
    // The strong stop is at least the 87% that kept the red line at 4.5:1 as a flat scrim (D12-80).
    expect(strong).toBeGreaterThanOrEqual(0.87);
    const after = /\.exq-hero\[data-state='photo'\] \.exq-hero__photo::after \{([^}]*)\}/.exec(
      pages,
    );
    expect(after?.[1]).toMatch(
      /linear-gradient\([\s\S]*?--scrim-photo-strong[\s\S]*?--scrim-photo-light/,
    );
  });

  it('over a white photo the strong zone keeps white text at 7:1 and the red line at 4.5:1', () => {
    const alpha = scrimAlpha('strong');
    const ink = hex('ink');
    const ground = [255, 255, 255].map((c, i) =>
      Math.round(alpha * (ink[i] ?? 0) + (1 - alpha) * c),
    );
    expect(contrast([255, 255, 255], ground)).toBeGreaterThanOrEqual(7);
    expect(contrast(hex('red-on-dark'), ground)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the measured contrast on the real photo at 390 and 768', () => {
    for (const [width, m] of Object.entries(MEASURED)) {
      expect(m.red, `${width} red`).toBeGreaterThanOrEqual(4.5);
      expect(m.white, `${width} white`).toBeGreaterThanOrEqual(7);
    }
  });
});
