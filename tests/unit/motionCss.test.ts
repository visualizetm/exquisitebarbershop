import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(`src/styles/${name}.css`, 'utf8');
const motionFull = read('motion');
/** The part that moves things; the reduced-motion block below it only switches everything off. */
const motion = motionFull.slice(0, motionFull.indexOf('@media (prefers-reduced-motion: reduce)'));

/** Splits on commas that are not inside parentheses. */
function topLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function declarations(css: string, property: 'transition' | 'animation'): string[] {
  const out: string[] = [];
  const re = new RegExp(`(?:^|[;{\\s])${property}\\s*:([^;}]*)`, 'g');
  for (const match of css.matchAll(re)) out.push(match[1] ?? '');
  return out;
}

describe('motion.css rules', () => {
  it('takes every duration and delay from the motion tokens', () => {
    const bad: string[] = [];
    const all = [...declarations(motion, 'transition'), ...declarations(motion, 'animation')];
    for (const decl of all) {
      // Remove token references, then nothing but zero may be left.
      const rest = decl.replace(/var\(--[a-z-]+\)/g, '').replace(/calc\([^)]*\)/g, '');
      for (const m of rest.matchAll(/(\d*\.?\d+)(ms|s)\b/g)) {
        if (Number(m[1]) !== 0) bad.push(m[0]);
      }
    }
    expect(bad).toEqual([]);
    expect(motion).not.toMatch(/animation-duration:\s*[\d.]+m?s/);
    expect(motion).not.toMatch(/transition-duration:\s*[\d.]+m?s/);
  });

  it('transitions only transform, opacity, clip-path, colors, shadows and visibility', () => {
    const allowed = new Set([
      'transform',
      'opacity',
      'clip-path',
      'background-color',
      'color',
      'border-color',
      'box-shadow',
      'visibility',
      'display',
      'overlay',
    ]);
    const used = new Set<string>();
    for (const decl of declarations(motion, 'transition')) {
      for (const part of topLevel(decl)) used.add(part.split(/\s+/)[0] ?? '');
    }
    expect([...used].filter((p) => !allowed.has(p))).toEqual([]);
  });

  it('animates only transform, opacity and stroke-dashoffset in keyframes', () => {
    const allowed = new Set(['transform', 'opacity', 'stroke-dashoffset']);
    const found = new Set<string>();
    for (const block of motion.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
      for (const prop of (block[1] ?? '').matchAll(/([a-z-]+)\s*:/g)) {
        const name = prop[1] ?? '';
        // Frame selectors (from, to, 50%) carry no colon; every property here is real.
        found.add(name);
      }
    }
    expect([...found].filter((p) => !allowed.has(p))).toEqual([]);
  });

  it('keeps scroll reveals light: 8px of travel on the reveal tokens, and no smooth scrolling on html', () => {
    const hidden = /\.motion-ready \[data-reveal-kind\]\[data-reveal='hidden'\] \{([^}]*)\}/.exec(
      motion,
    );
    expect(hidden?.[1]).toContain('translateY(8px)');
    const rule = /\.motion-ready \[data-reveal-kind\] \{([^}]*)\}/.exec(motion);
    expect(rule?.[1]).toContain('opacity var(--d-reveal)');
    expect(rule?.[1]).toContain('transform var(--d-reveal)');
    expect(rule?.[1]).toContain('var(--stagger-reveal)');
    for (const file of ['reset', 'base', 'kit', 'frame', 'pages']) {
      expect(read(file), `${file}.css`).not.toMatch(/scroll-behavior:\s*smooth/);
    }
  });

  it('loops nothing but the button spinner', () => {
    const loops = [...motion.matchAll(/animation:[^;]*\binfinite\b[^;]*;/g)].map((m) => m[0]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toContain('exq-spin');
  });

  it('hides content below the fold only under .motion-ready, and never under reduced motion', () => {
    // Every rule that sets opacity 0 or a clipped state is inside the no-preference block or
    // scoped to .motion-ready.
    const reduceAt = motionFull.indexOf('@media (prefers-reduced-motion: reduce)');
    const outside = motion.slice(
      0,
      motion.indexOf('@media (prefers-reduced-motion: no-preference)'),
    );
    expect(outside.trim().startsWith('/*')).toBe(true);
    expect(outside).not.toMatch(/opacity:\s*0/);
    for (const m of motion.matchAll(/\[data-reveal(?:-kind)?[^\]]*\]/g)) {
      const before = motion.slice(Math.max(0, m.index - 120), m.index);
      expect(before).toMatch(/\.motion-ready/);
    }
    expect(reduceAt).toBeGreaterThan(0);
    const reduce = motionFull.slice(reduceAt);
    expect(reduce).toContain('transition: none !important');
    expect(reduce).toContain('animation: none !important');
  });
});

describe('tokens', () => {
  it('keeps colors and font sizes in the tokens', () => {
    for (const file of ['base', 'kit', 'frame', 'motion']) {
      const css = read(file);
      expect(css, `${file}.css has a hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![\w-])/);
      expect(css, `${file}.css has an rgb color`).not.toMatch(/\brgba?\(/);
      for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
        expect(m[1], `${file}.css font-size`).toMatch(
          /var\(--t-(label|body|h3|h2|display|price)\)/,
        );
      }
    }
  });

  it('defines the six public type sizes and the motion tokens', () => {
    const tokens = read('tokens');
    for (const name of ['t-label', 't-body', 't-h3', 't-h2', 't-display', 't-price']) {
      expect(tokens).toContain(`--${name}:`);
    }
    for (const [name, value] of [
      ['d-fast', '150ms'],
      ['d-base', '250ms'],
      ['d-slow', '400ms'],
      ['stagger', '60ms'],
      ['d-reveal', '280ms'],
      ['stagger-reveal', '40ms'],
    ] as const) {
      expect(tokens).toContain(`--${name}: ${value};`);
    }
  });
});
