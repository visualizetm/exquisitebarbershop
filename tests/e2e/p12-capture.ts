import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Prompt 12 screenshots: the real shop content (the 15 seed photos, the five people, the real menus
 * and prices, the reviews) on the demo build, after a Demo data reset:
 *   /tmp/start-demo.sh   (npm run e2e:prod-server -- --port=4176 --profile=demo)
 *   npx tsx tests/e2e/p12-capture.ts
 *
 * Every public page is saved twice per theme and width: the first screen (`-top`, what a phone shows
 * before any scroll, bottom bar included) and the whole page. The owner screens are Website, Reviews
 * and Team, Prices (Drew), plus the two photo tabs that now hold the seed photos. Nothing is created:
 * the script only resets the demo data and reads.
 */
const BASE = process.env.CAPTURE_BASE ?? 'https://127.0.0.1:4176';
const OUT = join('docs', 'screens', 'p12');
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const PUBLIC: [string, string][] = [
  ['home', '/'],
  ['gallery', '/gallery'],
  ['services', '/services'],
  ['chair-drew', '/chairs/drew'],
  ['chair-iniya', '/chairs/iniya'],
  ['visit', '/visit'],
];

async function launch(): Promise<Browser> {
  return chromium.launch(
    process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  );
}

async function newContext(
  browser: Browser,
  size: { width: number; height: number },
  theme: 'light' | 'dark',
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: size,
    reducedMotion: 'reduce',
    ignoreHTTPSErrors: true,
  });
  // tsx wraps named functions in page.evaluate with __name; the page has no such helper.
  await context.addInitScript({ content: 'globalThis.__name = globalThis.__name || ((f) => f);' });
  await context.addInitScript((t) => {
    localStorage.setItem('exq-theme', t);
    sessionStorage.setItem('exq-demo-notice-seen', '1');
  }, theme);
  return context;
}

function watch(page: Page): void {
  page.on('pageerror', (e) => process.stdout.write(`pageerror: ${e.message.slice(0, 300)}\n`));
  page.on('requestfailed', (r) =>
    process.stdout.write(`failed: ${r.url().slice(0, 160)} ${r.failure()?.errorText ?? ''}\n`),
  );
  page.on('console', (m) => {
    if (m.type() === 'error') process.stdout.write(`console error: ${m.text().slice(0, 300)}\n`);
  });
}

async function ownerSignIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/admin/login`);
  await page.getByRole('button', { name: 'Enter demo dashboard' }).click();
  await page.waitForURL(/\/admin(?!\/login)/);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
}

/** Scrolls the page through so every lazy image loads, then waits until each one has decoded. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page
    .waitForFunction(() => [...document.images].every((img) => img.complete), undefined, {
      timeout: 15_000,
    })
    .catch(() => process.stdout.write('images still loading\n'));
  await page.waitForTimeout(300);
}

async function save(page: Page, name: string, full: boolean): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: full });
  process.stdout.write(`${path}\n`);
}

/** Facts the design checklist asks about, printed next to the shots. */
async function measure(page: Page, label: string): Promise<void> {
  const facts = await page.evaluate(() => {
    const boxes = Object.fromEntries(
      [
        ['hero', '.exq-hero'],
        ['title', '.exq-hero__title'],
        ['sub', '.exq-hero__sub'],
        ['actions', '.exq-hero__actions'],
        ['bar', '.exq-bar'],
      ].map(([key = '', selector = '']): [string, { top: number; bottom: number } | null] => {
        const el = document.querySelector(selector);
        if (!el) return [key, null];
        const r = el.getBoundingClientRect();
        return [key, { top: Math.round(r.top), bottom: Math.round(r.bottom) }];
      }),
    );
    const overflow = document.documentElement.scrollWidth > window.innerWidth;
    return {
      overflow,
      boxes,
      heroState: document.querySelector('.exq-hero')?.getAttribute('data-state') ?? null,
      images: [...document.images].map((img) => ({
        alt: img.getAttribute('alt'),
        loading: img.getAttribute('loading'),
        priority: img.getAttribute('fetchpriority'),
        natural: `${String(img.naturalWidth)}x${String(img.naturalHeight)}`,
      })),
    };
  });
  process.stdout.write(`${label} ${JSON.stringify(facts)}\n`);
}

async function publicPages(browser: Browser): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    for (const size of [PHONE, DESKTOP]) {
      const context = await newContext(browser, size, theme);
      const page = await context.newPage();
      watch(page);
      for (const [name, path] of PUBLIC) {
        await page.goto(`${BASE}${path}`);
        await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15_000 });
        await page.locator('.exq-footer[data-state="ready"]').waitFor({ timeout: 15_000 });
        await settle(page);
        const tag = `${name}-${theme}-${String(size.width)}`;
        await measure(page, tag);
        await save(page, `${tag}-top`, false);
        await save(page, tag, true);
      }
      await context.close();
    }
  }
}

async function ownerPages(browser: Browser): Promise<void> {
  for (const size of [DESKTOP, PHONE]) {
    const context = await newContext(browser, size, 'light');
    const page = await context.newPage();
    watch(page);
    await ownerSignIn(page);
    for (const tab of ['reviews', 'photo', 'gallery']) {
      await page.goto(`${BASE}/admin/website?tab=${tab}`);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await settle(page);
      await save(page, `admin-website-${tab}-light-${String(size.width)}`, true);
    }
    await page.goto(`${BASE}/admin/team`);
    await page.getByRole('link', { name: 'Drew', exact: true }).click();
    await page.getByRole('tab', { name: 'Prices' }).click();
    await page.locator('.exq-priceedit').first().waitFor();
    await settle(page);
    await save(page, `admin-team-prices-light-${String(size.width)}`, true);
    await context.close();
  }
}

function montage(pattern: RegExp, name: string, tile: string, across: number): void {
  const files = readdirSync(OUT)
    .filter((f) => pattern.test(f))
    .sort()
    .map((f) => join(OUT, f));
  if (files.length === 0) return;
  execFileSync('montage', [
    ...files,
    '-tile',
    `${String(Math.min(files.length, across))}x`,
    '-geometry',
    `${tile}+10+10`,
    '-gravity',
    'North',
    '-background',
    '#D9D9D9',
    join(OUT, name),
  ]);
  process.stdout.write(`${join(OUT, name)}\n`);
}

/** The demo database outlives the server, so every run starts from the seed data. */
async function resetDemoData(browser: Browser): Promise<void> {
  const context = await newContext(browser, DESKTOP, 'light');
  const page = await context.newPage();
  await ownerSignIn(page);
  const status = await page.evaluate(async () => {
    const res = await fetch('/api/admin/demo/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return res.status;
  });
  if (status !== 200) throw new Error(`demo reset answered ${String(status)}`);
  await context.close();
}

async function main(): Promise<void> {
  const browser = await launch();
  try {
    await resetDemoData(browser);
    await publicPages(browser);
    await ownerPages(browser);
    for (const theme of ['light', 'dark']) {
      montage(new RegExp(`-${theme}-390-top\\.png$`), `montage-${theme}-390.png`, '390x844', 6);
      montage(new RegExp(`-${theme}-1280-top\\.png$`), `montage-${theme}-1280.png`, '640x400', 3);
    }
  } finally {
    await browser.close();
  }
}

void main();
