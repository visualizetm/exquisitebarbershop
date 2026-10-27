import { existsSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { staffIds, uploadSamplePhoto } from '../photos';

/** The seed photos that were delivered to seed/photos: demo setup and Reset load exactly these. */
const SEED = (
  JSON.parse(readFileSync('seed/photos/manifest.json', 'utf8')) as {
    photos: { file: string; kind: string; alt: string }[];
  }
).photos.filter((photo) => existsSync(`seed/photos/${photo.file}`));
const SEED_HERO = SEED.find((photo) => photo.kind === 'hero') ?? null;
const SEED_GALLERY = SEED.filter((photo) => photo.kind === 'gallery').length;

/**
 * The showcase on a production-like build: https, the Vercel headers, production rules, an EMPTY
 * database and exactly these variables: MONGODB_URI, MONGODB_DB_NAME, APP_BASE_URL,
 * MANAGE_LINK_SECRET, CRON_SECRET, DEMO_MODE=true, STORAGE_DRIVER=mongo. Nobody runs /setup; the
 * first visit to Home sets the shop up.
 */
test.describe.configure({ mode: 'serial' });

const NOTICE_FLAG = 'exq-demo-notice-seen';
// The notice blocks the page on a first visit; every test but the notice's own has already seen it.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.titlePath.includes('the demo notice')) return;
  await page.addInitScript((flag) => {
    sessionStorage.setItem(flag, '1');
  }, NOTICE_FLAG);
});

const REFERENCE = /[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{4}/;
const BANNER = 'Demo mode. Sample data, resets anytime.';

/** Collects console errors and uncaught exceptions for the life of the page. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${page.url()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    errors.push(`${page.url()}: ${error.message}`);
  });
  return errors;
}

async function expectUp(page: Page) {
  await expect(page.locator('.exq-site-down')).toHaveCount(0);
  await expect(page.locator('.exq-main')).toBeVisible();
}

async function enterDemo(page: Page) {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByText(BANNER)).toBeVisible();
  await page.getByRole('button', { name: 'Enter demo dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'The floor' })).toBeVisible();
}

/** A PNG drawn in the page, so the real file input and the real resize run. */
async function pngBytes(page: Page, label: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((text) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = '#870A1F';
    ctx.fillRect(0, 0, 900, 1200);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 450, 600);
    return canvas.toDataURL('image/png');
  }, label);
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}

test('the first visit sets the shop up by itself and Home loads fully', async ({ page }) => {
  const errors = watchConsole(page);
  // Nothing was seeded, nothing ran /setup: this request does it.
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Gifted hands. Exquisite cuts.' })).toBeVisible({
    timeout: 40_000,
  });
  const cards = page.locator(
    '.exq-home__chairs .exq-chaircard[data-state]:not([data-state="loading"])',
  );
  // The first request seeds the whole shop, so the very first paint of data can take a while.
  await expect(cards.first()).toBeVisible({ timeout: 40_000 });
  // Cards swap from loading to loaded one by one, so the count is polled rather than read once.
  await expect.poll(() => cards.count()).toBe(5);
  // The five real people, in chair order, and none of the made up barbers the first seed had.
  await expect(cards.locator('.exq-chaircard__name')).toHaveText([
    'Dontrise',
    'Lee',
    'Drew',
    'Nelly Cutz',
    'Iniya',
  ]);
  await expect(page.getByText(/Marcus|Kris|\bTre\b|\bJay\b/)).toHaveCount(0);
  // Iniya books on Instagram, so her card says so instead of an open time.
  await expect(page.locator('.exq-home__chairs li[data-state="instagram"]')).toContainText(
    'Book through Instagram',
  );

  // The sample shop asks not to be indexed: in the HTML, as a header, and in robots.txt.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const html = await (await page.request.get('/')).text();
  expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  const api = await page.request.get('/api/shop');
  expect(api.headers()['x-robots-tag']).toBe('noindex, nofollow');
  expect(await (await page.request.get('/robots.txt')).text()).toContain('Disallow: /');
  const health = (await (await page.request.get('/api/health')).json()) as { ok: boolean };
  expect(health.ok).toBe(true);
  expect(errors).toEqual([]);
});

test('every public page renders with intentional placeholders and no console errors', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto('/');
  await expectUp(page);
  // The delivered seed photos: the hero shows its photo, and "the work" waits for three photos.
  await expect(
    page.locator(`.exq-hero[data-state="${SEED_HERO ? 'photo' : 'text'}"]`),
  ).toBeVisible();
  if (SEED_HERO) {
    await expect(page.locator('.exq-hero__photo img')).toHaveAttribute('alt', SEED_HERO.alt);
  }
  await expect(page.locator('.exq-home__work')).toHaveCount(SEED_GALLERY >= 3 ? 1 : 0);

  await page.goto('/services');
  await expectUp(page);
  await expect(page.locator('.exq-pricerow').first()).toBeVisible();

  await page.goto('/chairs');
  await expectUp(page);
  await expect(
    page.locator('.exq-chaircard .exq-photoframe[data-state="placeholder"]').first(),
  ).toBeVisible();

  await page.goto('/chairs/lee');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Lee', exact: true })).toBeVisible();
  await expect(page.locator('.exq-chair .exq-photoframe[data-state="placeholder"]')).toBeVisible();
  // Nothing is credited to Lee, so the shop's photos stand in, labeled "From the shop".
  await expect(page.locator('.exq-chair__work[data-state="shop"]')).toHaveCount(
    SEED_GALLERY > 0 ? 1 : 0,
  );
  if (SEED_GALLERY > 0) {
    await expect(page.locator('.exq-chair__work')).toContainText('From the shop');
  }

  // Iniya takes bookings on Instagram: her page says so and has no Book button.
  await page.goto('/chairs/iniya');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Iniya', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book through Instagram' })).toHaveAttribute(
    'href',
    'https://instagram.com/iniyathestylist',
  );
  await expect(page.getByRole('link', { name: /^Book Iniya/ })).toHaveCount(0);

  await page.goto('/gallery');
  await expectUp(page);
  if (SEED_GALLERY > 0) {
    await expect(page.locator('.exq-photo-grid__item')).toHaveCount(Math.min(SEED_GALLERY, 30));
    // Nobody is credited yet, so there are no barber filter chips.
    await expect(page.locator('.exq-gallery .exq-chips')).toHaveCount(0);
  } else {
    await expect(page.locator('.exq-state[data-state="empty"]')).toBeVisible();
  }

  await page.goto('/visit');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Find us', exact: true })).toBeVisible();

  await page.goto('/manage');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Manage your booking' })).toBeVisible();

  await page.goto('/book?barber=lee');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeFocused();

  // No broken image anywhere on the way: every image that is on a page decoded.
  for (const path of ['/', '/chairs', '/chairs/lee', '/chairs/iniya', '/visit']) {
    await page.goto(path);
    await expectUp(page);
    const broken = await page.evaluate(
      () =>
        Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).length,
    );
    expect(broken, path).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('a booking completes end to end and shows its manage link on screen', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/book?barber=lee');
  await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeFocused();
  await page.getByLabel(/^Haircut(?! and| with)/).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // The second open day is never today, so the booking is always outside the reschedule cutoff.
  await expect(page.getByRole('heading', { name: 'Pick a day' })).toBeFocused();
  await page.locator('.exq-day-option[data-state="available"] button').nth(1).click();
  await expect(page.getByRole('heading', { name: 'Pick a time' })).toBeFocused();
  await page.locator('.exq-time-option button').first().click();
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeFocused();
  await page.getByLabel('Name').fill('Showcase Visitor');
  await page.getByLabel('Mobile phone').fill('2155550142');
  await page.getByRole('button', { name: 'Review booking' }).click();
  await expect(page.getByRole('heading', { name: 'Review and confirm' })).toBeFocused();
  await page.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.getByRole('heading', { name: 'You are booked' })).toBeFocused();
  const code = await page.locator('.exq-book-done__code').textContent();
  expect(code).toMatch(REFERENCE);
  // Emails are off, so the screen carries the link a customer would have received.
  const link = page.locator('.exq-book-done__demo-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /\/manage\?token=v1\./);
  await expect(page.locator('.exq-book-done__demo')).toContainText('Demo mode');
  await link.click();
  await expect(page.getByRole('heading', { name: 'Your appointment' })).toBeFocused();
  await expect(page.locator('.exq-manage__reference')).toContainText(code ?? '');
  expect(errors).toEqual([]);
});

test('the demo button opens admin Today with sample bookings, and Bookings lists them', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await enterDemo(page);
  // The banner rides along in the admin.
  await expect(page.getByText(BANNER)).toBeVisible();
  await expect(page.locator('.exq-floorcard').first()).toBeVisible();

  await page.goto('/admin/bookings');
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  const body = page.locator('.exq-adm__content');
  // Obviously fictional customers, and the booking made a moment ago.
  await expect(body).toContainText('Showcase Visitor');
  await expect(body).toContainText(/Pat Placeholder|Sam Sample|Terry Testcase|Jamie Demo/);
  expect(errors).toEqual([]);
});

test('a photo uploaded in the admin shows on the profile, in the gallery and as the hero', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await enterDemo(page);

  // The real screen: pick a chair, pick a file, describe it, upload. Stored in MongoDB, no R2.
  await page.goto('/admin/team');
  await page.getByRole('link', { name: 'Lee', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Photos of Lee' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'lee.png',
    mimeType: 'image/png',
    buffer: await pngBytes(page, 'LEE'),
  });
  await page
    .getByLabel('Describe the photo (alt text)')
    .fill('Lee at his chair, showcase portrait');
  await page.getByRole('button', { name: 'Upload photo' }).click();
  await expect(
    page.locator('.exq-adm-photos__item img[alt="Lee at his chair, showcase portrait"]'),
  ).toBeVisible();
  const stored = await page.locator('.exq-adm-photos__item img').first().getAttribute('src');
  expect(stored).toMatch(/\/api\/media\/[0-9a-f-]{36}\.webp$/);

  // A gallery photo credited to Lee and a hero, through the same flow.
  const ids = await staffIds(page);
  await uploadSamplePhoto(page, {
    kind: 'gallery',
    staffId: ids.lee ?? '',
    alt: 'A skin fade by Lee',
    label: 'FADE',
    color: '#1F1F1F',
  });
  await uploadSamplePhoto(page, {
    kind: 'hero',
    alt: 'The shop floor',
    label: 'EXQ',
    color: '#333333',
  });

  // Public pages, signed out: the portrait, the gallery tile, the work strip and the hero.
  await page.context().clearCookies();
  await page.goto('/chairs/lee');
  const arch = page.locator('.exq-chair .exq-photoframe[data-state="loaded"] img');
  await expect(arch).toHaveAttribute('src', /\/api\/media\//);
  expect(await arch.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.exq-chair__work .exq-photo-grid__item').first()).toBeVisible();

  await page.goto('/gallery');
  const tile = page.locator('.exq-photo-grid__button img[alt="A skin fade by Lee"]');
  await expect(tile).toBeVisible();
  expect(await tile.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.goto('/');
  await expect(page.locator('.exq-hero[data-state="photo"]')).toBeVisible();
  await expect(page.locator('.exq-home__work .exq-photo-grid__item').first()).toBeVisible();

  const media = await page.request.get(stored ?? '/');
  expect(media.status()).toBe(200);
  expect(media.headers()['cache-control']).toContain('immutable');
  expect(media.headers()['content-type']).toBe('image/webp');
  expect(errors).toEqual([]);
});

test('the barber portal shows the demo PIN, and it opens the portal', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/team');
  await expect(page.getByRole('heading', { name: "Who's working?" })).toBeVisible();
  await expect(page.getByText('Demo PIN: 246810')).toBeVisible();
  await page.getByRole('button', { name: /^Lee/ }).click();
  await expect(page.getByText('Demo PIN: 246810')).toBeVisible();
  const pad = page.getByRole('group', { name: 'PIN for Lee' });
  // A wrong PIN is refused, the demo PIN opens Today.
  for (const digit of '135790') await pad.getByRole('button', { name: digit, exact: true }).click();
  await expect(page.getByText('That PIN did not work. Try again.')).toBeVisible();
  for (const digit of '246810') await pad.getByRole('button', { name: digit, exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Hey, /, level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Week', exact: true }).click();
  await expect(page.locator('.exq-team-day')).toHaveCount(7);
  // The one wrong PIN is a 401 the browser logs; nothing else may be.
  expect(errors.filter((e) => !e.includes('401'))).toEqual([]);
});

test.describe('the demo notice', () => {
  const BODY =
    'This site is a demo built by Visualize Studio for Exquisite Barber & Beauty Lounge. Bookings made here are not real and nothing is sent to the shop. It is a preview for Visualize clients.';
  test('blocks the first visit with the words, a link, and the page behind unreachable', async ({
    page,
  }) => {
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: 'This is a demo' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(BODY);
    const about = dialog.getByRole('link', { name: 'visualizestudio.org' });
    await expect(about).toHaveAttribute('href', 'https://visualizestudio.org');
    await expect(about).toHaveAttribute('target', '_blank');
    await expect(about).toHaveAttribute('rel', /noopener/);
    await expect(dialog.getByRole('button', { name: 'Enter the demo' })).toBeVisible();
    // Tab cycles inside the dialog (or out to the browser itself) and never reaches the page.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(
          () => document.activeElement?.closest('header, main, footer, nav, .exq-bar') ?? null,
        ),
      ).toBeNull();
    }
    const blocked = await page.evaluate(() =>
      document
        .elementsFromPoint(window.innerWidth / 2, 10)
        .some((el) => el.tagName === 'DIALOG' || el.closest('dialog') !== null),
    );
    expect(blocked).toBe(true);
  });

  test('Escape closes it, and it stays away for the rest of the session on every area', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'This is a demo' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'This is a demo' })).toBeHidden();
    // The footer keeps a small line afterwards.
    await expect(page.getByRole('link', { name: 'Demo by Visualize Studio' })).toHaveAttribute(
      'href',
      'https://visualizestudio.org',
    );
    for (const path of ['/', '/services', '/admin/login', '/team']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('dialog[open]'), path).toHaveCount(0);
    }
  });

  test('Enter the demo closes it too, and the admin and the barber portal show it first thing', async ({
    browser,
    baseURL,
  }) => {
    for (const path of ['/admin/login', '/team']) {
      const fresh = await (
        await browser.newContext({ ignoreHTTPSErrors: true, ...(baseURL ? { baseURL } : {}) })
      ).newPage();
      await fresh.goto(path);
      const dialog = fresh.getByRole('dialog', { name: 'This is a demo' });
      await expect(dialog, path).toBeVisible();
      await dialog.getByRole('button', { name: 'Enter the demo' }).click();
      await expect(dialog, path).toBeHidden();
      await fresh.context().close();
    }
  });

  test('with storage blocked it shows on every page load', async ({ page }) => {
    await page.addInitScript(() => {
      const blocked = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
      Object.defineProperty(window, 'sessionStorage', {
        get: blocked,
        configurable: true,
      });
    });
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: 'This is a demo' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Enter the demo' }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'This is a demo' })).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`passes axe with no layout shift, ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('exq-theme', t);
      }, theme);
      await page.goto('/');
      const dialog = page.getByRole('dialog', { name: 'This is a demo' });
      await expect(dialog).toBeVisible();
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== 'running'),
      );
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
      // An overlay: it moves nothing on the page behind it.
      const shift = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let total = 0;
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                const shiftEntry = entry as PerformanceEntry & {
                  value: number;
                  hadRecentInput: boolean;
                };
                if (!shiftEntry.hadRecentInput) total += shiftEntry.value;
              }
            });
            observer.observe({ type: 'layout-shift', buffered: true });
            setTimeout(() => {
              resolve(total);
            }, 300);
          }),
      );
      expect(shift).toBeLessThan(0.1);
    });
  }
});

test('Reset demo data wipes the changes and loads the sample shop again', async ({ page }) => {
  const errors = watchConsole(page);
  await enterDemo(page);
  await page.goto('/admin/settings?tab=demo');
  await expect(page.getByRole('heading', { name: 'Demo data', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo data' }).click();
  const sheet = page.locator('dialog.exq-dialog[open]');
  await expect(sheet.getByRole('heading', { name: 'Reset demo data?' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Reset it' }).click();

  // Back on a fresh Today, still signed in.
  await expect(page).toHaveURL(/\/admin\/shop\/today$/);
  await expect(page.getByRole('heading', { name: 'The floor' })).toBeVisible();

  // The photos and the visitor's booking are gone; the sample shop is back.
  await page.goto('/admin/bookings');
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  await expect(page.locator('.exq-adm__content')).not.toContainText('Showcase Visitor');
  await expect(page.locator('.exq-adm__content')).toContainText(
    /Pat Placeholder|Sam Sample|Terry Testcase|Jamie Demo/,
  );
  await page.context().clearCookies();
  await page.goto('/chairs/lee');
  await expect(page.locator('.exq-chair .exq-photoframe[data-state="placeholder"]')).toBeVisible();
  // The uploads are gone and the seed photos are back.
  await page.goto('/gallery');
  await expect(page.locator('.exq-photo-grid__button img[alt="A skin fade by Lee"]')).toHaveCount(
    0,
  );
  if (SEED_GALLERY === 0)
    await expect(page.locator('.exq-state[data-state="empty"]')).toBeVisible();
  await page.goto('/');
  await expect(
    page.locator(`.exq-hero[data-state="${SEED_HERO ? 'photo' : 'text'}"]`),
  ).toBeVisible();
  if (SEED_HERO) {
    await expect(page.locator('.exq-hero__photo img')).toHaveAttribute('alt', SEED_HERO.alt);
  }
  await expectUp(page);
  expect(errors).toEqual([]);
});
