import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The theme script in index.html runs before the first paint, so its exact hash must be in the CSP. */
describe('the pre-paint theme script', () => {
  const html = readFileSync('index.html', 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '');
  const csp = (
    JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      headers: { headers: { key: string; value: string }[] }[];
    }
  ).headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === 'Content-Security-Policy')?.value;

  it('is the only inline script and its sha256 is allowed by the CSP without unsafe-inline', () => {
    expect(scripts).toHaveLength(1);
    const hash = `sha256-${createHash('sha256')
      .update(scripts[0] ?? '')
      .digest('base64')}`;
    expect(csp).toContain(`'${hash}'`);
    expect(csp?.match(/script-src [^;]*/)?.[0]).not.toContain('unsafe-inline');
  });

  it('reads the stored choice, sets data-theme and the theme color, and never throws', () => {
    const script = scripts[0] ?? '';
    expect(script).toContain("localStorage.getItem('exq-theme')");
    expect(script).toContain("setAttribute('data-theme',t)");
    expect(script).toContain('#111111');
    expect(script).toContain('#FFFFFF');
    expect(script).toContain('catch(e){}');
  });
});

describe('the content security policy and Cloudinary', () => {
  const csp =
    (
      JSON.parse(readFileSync('vercel.json', 'utf8')) as {
        headers: { headers: { key: string; value: string }[] }[];
      }
    ).headers
      .flatMap((h) => h.headers)
      .find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
  const directive = (name: string) =>
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `))
      ?.split(/\s+/)
      .slice(1);

  it('allows images only from the site, data and res.cloudinary.com', () => {
    expect(directive('img-src')).toEqual(["'self'", 'data:', 'https://res.cloudinary.com']);
  });

  it('allows frames only from Google Maps (the Visit page map)', () => {
    expect(directive('frame-src')).toEqual(['https://www.google.com', 'https://maps.google.com']);
  });

  it('allows connections only to the site and api.cloudinary.com', () => {
    expect(directive('connect-src')).toEqual(["'self'", 'https://api.cloudinary.com']);
  });
});
