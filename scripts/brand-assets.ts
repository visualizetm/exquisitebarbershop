import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/**
 * Renders the OG image, the favicons and the apple touch icon from the brand SVGs.
 * Run once after the brand files change: `npx tsx scripts/brand-assets.ts`.
 * Outputs land in public/ and are committed, so the build never needs a browser.
 */
const INK = '#111111';
const fonts = `${process.cwd()}/node_modules/@fontsource-variable/jost/files`;
const primaryWhite = readFileSync('public/brand/exq-primary-white.svg', 'utf8');
const qBlack = readFileSync('public/brand/exq-q-icon-black.svg', 'utf8');
const qWhite = readFileSync('public/brand/exq-q-icon-white.svg', 'utf8');

function fill(svg: string): string {
  return svg.replace('<svg', '<svg style="width:100%;height:100%;display:block"');
}

async function main() {
  const browser = await chromium.launch();
  async function shot(
    path: string,
    width: number,
    height: number,
    html: string,
    transparent = false,
  ) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(html);
    // Fonts are declared with file:// sources; waiting for the load keeps the tagline in Jost.
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    await page.screenshot({ path, type: 'png', omitBackground: transparent });
    await page.close();
    process.stdout.write(`${path}\n`);
  }
  async function icon(path: string, size: number, svg: string, bg: string, inset: number) {
    const inner = size - inset * 2;
    await shot(
      path,
      size,
      size,
      `<html><body style="margin:0;width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center"><div style="width:${inner}px;height:${inner}px">${fill(svg)}</div></body></html>`,
      bg === 'transparent',
    );
  }

  await icon('public/icon-32.png', 32, qBlack, 'transparent', 0);
  await icon('public/icon-192.png', 192, qBlack, 'transparent', 0);
  await icon('public/icon-512.png', 512, qBlack, 'transparent', 0);
  await icon('public/icon-512-maskable.png', 512, qWhite, INK, 96);
  await icon('public/apple-touch-icon.png', 180, qWhite, INK, 24);

  await shot(
    'public/og.png',
    1200,
    630,
    `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Jost;font-weight:100 900;src:url(file://${fonts}/jost-latin-wght-normal.woff2) format('woff2')}
html,body{margin:0;width:1200px;height:630px;background:${INK};overflow:hidden}
.wrap{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:40px;height:630px;padding:0 96px;box-sizing:border-box;font-family:Jost,sans-serif;color:#fff}
.logo{width:680px}
.tag{margin:0;font-size:28px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#D9D9D9}
.dot{position:absolute;right:96px;bottom:72px;width:16px;height:16px;border-radius:999px;background:#C8102E}
</style></head><body><div class="wrap"><div class="logo">${fill(primaryWhite)}</div><p class="tag">Fresh cuts. Gifted hands. Brookhaven, PA</p></div><span class="dot"></span></body></html>`,
  );
  await browser.close();
}

await main();
