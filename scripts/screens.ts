import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

/**
 * Milestone screenshots: every given route at 390 and 1280 wide, saved under
 * docs/screens/<milestone>/, plus one montage per width built with ImageMagick.
 *
 *   npx tsx scripts/screens.ts m1 / /services /book
 *
 * Expects the e2e server (npm run e2e:server) on WEB_PORT, default 5174. Routes
 * under /admin sign in as the seeded owner first.
 */
const WEB_PORT = process.env.WEB_PORT ?? '5174';
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const [milestoneArg, ...routes] = process.argv.slice(2);
if (!milestoneArg || routes.length === 0) {
  console.error('Usage: tsx scripts/screens.ts <milestone> <route> [route...]');
  process.exit(1);
}
const milestone: string = milestoneArg;

const WIDTHS = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
];

function fileName(route: string): string {
  const clean = route
    .replace(/^\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '');
  return clean || 'home';
}

async function main(): Promise<void> {
  const dir = join('docs', 'screens', milestone);
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  );
  for (const size of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    if (routes.some((r) => r.startsWith('/admin'))) {
      const { E2E_OWNER } = await import('./e2e-accounts');
      await page.goto(`${BASE}/admin/login`);
      await page.getByLabel('Email').fill(E2E_OWNER.email);
      await page.getByLabel('Password').fill(E2E_OWNER.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL(/\/admin(?!\/login)/);
    }
    for (const route of routes) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const target = join(dir, `${fileName(route)}-${size.name}.png`);
      await page.screenshot({ path: target, fullPage: true });
      console.log(target);
    }
    await context.close();
  }
  await browser.close();

  for (const size of WIDTHS) {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(`-${size.name}.png`) && !f.startsWith('montage'))
      .map((f) => join(dir, f));
    if (files.length === 0) continue;
    const out = join(dir, `montage-${size.name}.png`);
    // Full-page shots differ in height; cap each tile so the montage stays readable.
    const tile = size.name === '390' ? '390x1600' : '1280x1400';
    execFileSync('montage', [
      ...files,
      '-tile',
      `${Math.min(files.length, size.name === '390' ? 4 : 2)}x`,
      '-geometry',
      `${tile}+12+12`,
      '-gravity',
      'North',
      '-background',
      '#D9D9D9',
      out,
    ]);
    console.log(out);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
