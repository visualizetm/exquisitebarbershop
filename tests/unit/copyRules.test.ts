import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, ext);
    return ext.test(name) ? [path] : [];
  });
}

const sources = [
  ...files('src', /\.(tsx?|css)$/),
  ...files('shared', /\.ts$/),
  ...files('server/services/../notifications/templates', /\.ts$/),
  'index.html',
  'seed/shop.ts',
];

describe('copy rules (CLAUDE.md rule 8)', () => {
  it('has no em dash and no emoji anywhere in the source', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      if (text.includes('—')) offenders.push(`${file}: em dash`);
      if (/\p{Extended_Pictographic}/u.test(text.replace(/[©®™]/g, ''))) {
        offenders.push(`${file}: emoji`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses no purple in the styles and no gradient but the placeholder stripe', () => {
    const css = files('src/styles', /\.css$/).map((f) => [f, readFileSync(f, 'utf8')] as const);
    for (const [file, text] of css) {
      expect(text, `${file} has a purple`).not.toMatch(
        /purple|violet|indigo|#(?:[89ab][0-9a-f]){1}[0-9a-f]{2}[ef][0-9a-f]/i,
      );
      const gradients = text.match(/(?:linear|radial|conic)-gradient\(/g) ?? [];
      // The only gradient is the hard-edged diagonal stripe of the photo placeholder.
      if (!file.endsWith('kit.css')) expect(gradients, file).toEqual([]);
      else expect(gradients).toHaveLength(1);
    }
  });

  it('never clips text to a gradient or uses glass', () => {
    for (const file of files('src/styles', /\.css$/)) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/background-clip:\s*text/);
      expect(text, file).not.toMatch(/backdrop-filter/);
    }
  });
});
