import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { E2E_OWNER } from '../../scripts/e2e-accounts';

/**
 * Audit captures and page facts. Every Book step, Manage and the admin screens
 * at 390 and 1280 in light and dark, plus a facts JSON per page at 390 light.
 *
 *   npx tsx tests/e2e/audit.ts            (expects the e2e server on 5174)
 */
const BASE = `http://127.0.0.1:${process.env.WEB_PORT ?? '5174'}`;
const DIR = join('docs', 'screens', 'audit');
const WIDTHS = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
];
const PUBLIC = ['/', '/services', '/chairs', '/chairs/marcus', '/gallery', '/visit', '/manage'];
const ADMIN = [
  '/admin',
  '/admin/schedule',
  '/admin/bookings/new',
  '/admin/photos',
  '/admin/settings',
];

interface Facts {
  url: string;
  title: string;
  description: string;
  h1: string[];
  fontFamilies: string[];
  fontSizes: string[];
  textColors: string[];
  backgrounds: string[];
  radii: string[];
  buttons: string[];
  smallClickables: string[];
  imagesWithoutAlt: string[];
  oversizedImages: string[];
  scrollListeners: number;
  fadeInHidden: string[];
  gradients: string[];
  lcp: number | null;
  cls: number;
  consoleErrors: string[];
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Password').fill(E2E_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin(?!\/login)/);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 50));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
}

/** Audit finding: the sticky bar hides while a checkbox has focus, so blur before Continue. */
async function pressContinue(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.getByRole('button', { name: 'Continue' }).first().click();
}

async function shot(page: Page, name: string, theme: string, width: string): Promise<void> {
  const target = join(DIR, `${name}-${theme}-${width}.png`);
  await page.screenshot({ path: target, fullPage: true });
  process.stdout.write(`${target}\n`);
}

/** Walks the booking flow on the current page and screenshots each step. */
async function bookSteps(page: Page, theme: string, width: string): Promise<void> {
  await page.goto(`${BASE}/book`, { waitUntil: 'networkidle' });
  await shot(page, 'book-1-services', theme, width);
  await page.getByLabel(/Classic Cut/).click();
  await pressContinue(page);
  await page.getByRole('heading', { name: 'Choose your chair' }).waitFor();
  await shot(page, 'book-2-chair', theme, width);
  await page
    .getByRole('button', { name: /Marcus/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await page.getByRole('heading', { name: 'Pick a day' }).waitFor();
  await page.locator('.exq-day-option[data-state="available"] button').first().waitFor();
  await shot(page, 'book-3-day', theme, width);
  await page.locator('.exq-day-option[data-state="available"] button').nth(1).click();
  await page.getByRole('heading', { name: 'Pick a time' }).waitFor();
  await page.locator('.exq-time-option button').first().waitFor();
  await shot(page, 'book-4-time', theme, width);
  await page.locator('.exq-time-option button').first().click();
  await page.getByRole('heading', { name: 'Your details' }).waitFor();
  await shot(page, 'book-5-details', theme, width);
  await page.getByLabel('Name').fill('Audit Customer');
  await page
    .getByLabel('Mobile phone')
    .fill(`215555${String(1000 + Math.floor(Math.random() * 8999))}`);
  await page.getByRole('button', { name: 'Review booking' }).click();
  await page.getByRole('heading', { name: 'Review and confirm' }).waitFor();
  await shot(page, 'book-6-confirm', theme, width);
  await page.getByRole('button', { name: 'Confirm booking' }).first().click();
  await page.getByRole('heading', { name: 'You are booked' }).waitFor();
  await settle(page);
  await shot(page, 'book-7-done', theme, width);
  const manage = await page.locator('.exq-book-done__manage-url a').getAttribute('href');
  if (manage) {
    await page.goto(manage, { waitUntil: 'networkidle' });
    await shot(page, 'manage-booking', theme, width);
  }
}

/** Counts scroll listeners and records LCP and CLS before the page's own scripts run. */
const INIT_SCRIPT = `(() => {
  const w = window;
  w.__scroll = 0;
  w.__lcp = null;
  w.__cls = 0;
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (type === 'scroll' || type === 'wheel' || type === 'touchmove') w.__scroll += 1;
    orig.call(this, type, ...rest);
  };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) w.__lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) w.__cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
})()`;

const FACTS_SCRIPT = `(() => {
  const w = window;
  const all = [...document.querySelectorAll('body *')];
  const visible = all.filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  });
  const uniq = (xs) => [...new Set(xs)].sort();
  const label = (el) => el.tagName.toLowerCase() + '.' + (el.getAttribute('class') || '').split(' ')[0];
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0);
  const textEls = visible.filter(hasText);
  const buttons = visible.filter((el) => el.matches('button, a.exq-btn, [role="button"]') && el.innerText.trim().length > 0);
  const clickables = visible.filter((el) => el.matches('a[href], button, input:not([type=hidden]), [role="button"], [role="menuitemradio"], [role="radio"]'));
  return {
    title: document.title,
    description: (document.querySelector('meta[name="description"]') || {}).content || '',
    h1: [...document.querySelectorAll('h1')].map((h) => (h.textContent || '').trim()),
    fontFamilies: uniq(textEls.map((el) => getComputedStyle(el).fontFamily.split(',')[0])),
    fontSizes: uniq(textEls.map((el) => getComputedStyle(el).fontSize)),
    textColors: uniq(textEls.map((el) => getComputedStyle(el).color)),
    backgrounds: uniq(visible.map((el) => getComputedStyle(el).backgroundColor).filter((c) => c !== 'rgba(0, 0, 0, 0)')),
    radii: uniq(visible.map((el) => getComputedStyle(el).borderRadius).filter((r) => r !== '0px')),
    buttons: uniq(buttons.map((el) => {
      const cs = getComputedStyle(el);
      return label(el) + '[' + (el.getAttribute('data-variant') || '') + '] bg ' + cs.backgroundColor + ' fg ' + cs.color + ' r ' + cs.borderRadius + ' h ' + Math.round(el.getBoundingClientRect().height);
    })),
    smallClickables: uniq(clickables.filter((el) => {
      const r = el.getBoundingClientRect();
      return (r.width < 44 || r.height < 44) && !el.closest('.exq-sticky, dialog');
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return label(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + (el.textContent || '').trim().slice(0, 30) + '"';
    })),
    imagesWithoutAlt: [...document.images].filter((img) => !img.hasAttribute('alt')).map((img) => img.src.slice(-50)),
    oversizedImages: [...document.images].filter((img) => {
      const shown = img.getBoundingClientRect().width * devicePixelRatio;
      return shown > 0 && img.naturalWidth > shown * 2 && !img.src.endsWith('.svg');
    }).map((img) => img.src.slice(-40) + ' ' + img.naturalWidth + 'px for ' + Math.round(img.getBoundingClientRect().width * devicePixelRatio) + 'px'),
    scrollListeners: w.__scroll,
    fadeInHidden: all.filter((el) => {
      const cs = getComputedStyle(el);
      return cs.opacity === '0' && cs.transitionProperty.includes('opacity');
    }).map(label),
    gradients: uniq(visible.map((el) => getComputedStyle(el).backgroundImage).filter((b) => b.includes('gradient'))),
    lcp: w.__lcp,
    cls: Math.round(w.__cls * 1000) / 1000,
  };
})()`;

async function facts(browser: Browser, url: string, admin: boolean): Promise<Facts> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`));
  await page.addInitScript(INIT_SCRIPT);
  if (admin) await signIn(page);
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  await settle(page);
  // Plain JavaScript as a string: tsx would otherwise inject a __name helper into the page.
  const data = await page.evaluate<Omit<Facts, 'url' | 'consoleErrors'>>(FACTS_SCRIPT);
  await context.close();
  return { url, ...data, consoleErrors };
}

async function main(): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch();
  const factsOnly = process.argv.includes('--facts-only');
  for (const theme of factsOnly ? [] : (['light', 'dark'] as const)) {
    for (const size of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.addInitScript((t) => {
        localStorage.setItem('exq-theme', t);
      }, theme);
      for (const route of PUBLIC) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
        await settle(page);
        await shot(
          page,
          route === '/' ? 'home' : route.slice(1).replace(/\//g, '-'),
          theme,
          size.name,
        );
      }
      await bookSteps(page, theme, size.name);
      await signIn(page);
      for (const route of ADMIN) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
        await settle(page);
        await shot(page, route.slice(1).replace(/\//g, '-'), theme, size.name);
      }
      await context.close();
    }
  }
  const results: Facts[] = [];
  for (const url of ['/', '/services', '/chairs', '/chairs/marcus', '/gallery', '/visit', '/book'])
    results.push(await facts(browser, url, false));
  for (const url of ['/admin', '/admin/schedule', '/admin/photos'])
    results.push(await facts(browser, url, true));
  writeFileSync(join(DIR, 'facts.json'), JSON.stringify(results, null, 2));
  await browser.close();

  for (const theme of ['light', 'dark']) {
    for (const size of WIDTHS) {
      const files = readdirSync(DIR)
        .filter((f) => f.endsWith(`-${theme}-${size.name}.png`) && !f.startsWith('montage'))
        .map((f) => join(DIR, f));
      const out = join(DIR, `montage-${theme}-${size.name}.png`);
      execFileSync('montage', [
        ...files,
        '-tile',
        `${size.name === '390' ? 6 : 3}x`,
        '-geometry',
        `${size.name === '390' ? '390x1400' : '1280x1200'}+10+10`,
        '-gravity',
        'North',
        '-background',
        '#D9D9D9',
        out,
      ]);
      process.stdout.write(`${out}\n`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
