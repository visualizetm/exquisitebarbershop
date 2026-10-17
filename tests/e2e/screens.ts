import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';

/**
 * Milestone screenshots: every given route at 390 and 1280 wide, saved under
 * docs/screens/<milestone>/, plus one montage per width built with ImageMagick.
 *
 *   npx tsx tests/e2e/screens.ts m1 / /services /book
 *
 * Expects the e2e server (npm run e2e:server) on WEB_PORT, default 5174. Routes
 * under /admin sign in as the seeded owner first.
 */
const WEB_PORT = process.env.WEB_PORT ?? '5174';
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const args = process.argv.slice(2);
/** --photos uploads sample hero, chair and gallery photos first, so the pages show them. */
const withPhotos = args.includes('--photos');
const [milestoneArg, ...routes] = args.filter((a) => a !== '--photos');
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
  if (withPhotos) await seedPhotos(browser);
  for (const size of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    if (routes.some((r) => r.startsWith('/admin'))) {
      const { E2E_OWNER } = await import('../../scripts/e2e-accounts');
      await page.goto(`${BASE}/admin/login`);
      await page.getByLabel('Email').fill(E2E_OWNER.email);
      await page.getByLabel('Password').fill(E2E_OWNER.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL(/\/admin(?!\/login)/);
    }
    for (const route of routes) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      // Walk down the page so lazy images load, then return to the top for the capture.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      const target = join(dir, `${fileName(route)}-${size.name}.png`);
      await page.screenshot({ path: target, fullPage: true });
      process.stdout.write(`${target}\n`);
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
    process.stdout.write(`${out}\n`);
  }
}

/** Signs in as the seeded owner and uploads one hero, one portrait per chair and six gallery photos. */
async function seedPhotos(browser: Browser): Promise<void> {
  const { E2E_OWNER } = await import('../../scripts/e2e-accounts');
  const { staffIds, uploadSamplePhoto } = await import('./photos');
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Password').fill(E2E_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin(?!\/login)/);
  const ids = await staffIds(page);
  const tones = ['#1F1F1F', '#333333', '#4A4A4A', '#650818', '#870A1F', '#A80D27'];
  await uploadSamplePhoto(page, {
    kind: 'hero',
    alt: 'The shop floor',
    label: 'EXQ',
    color: '#1F1F1F',
  });
  let i = 0;
  for (const [slug, id] of Object.entries(ids)) {
    await uploadSamplePhoto(page, {
      kind: 'staff',
      staffId: id,
      alt: `Portrait of ${slug}`,
      label: slug.toUpperCase(),
      color: tones[i % tones.length] ?? '#333333',
    });
    if (i < 6) {
      await uploadSamplePhoto(page, {
        kind: 'gallery',
        staffId: id,
        alt: `Work by ${slug}`,
        label: `${slug.toUpperCase()} CUT`,
        color: tones[(i + 3) % tones.length] ?? '#333333',
      });
    }
    i += 1;
  }
  await context.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
