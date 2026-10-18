import { expect, test, type Page } from '@playwright/test';
import { staffIds, uploadSamplePhoto } from '../photos';

/**
 * The showcase on a production-like build: https, the Vercel headers, production rules, an EMPTY
 * database and exactly these variables: MONGODB_URI, MONGODB_DB_NAME, APP_BASE_URL,
 * MANAGE_LINK_SECRET, CRON_SECRET, DEMO_MODE=true, STORAGE_DRIVER=mongo. Nobody runs /setup; the
 * first visit to Home sets the shop up.
 */
test.describe.configure({ mode: 'serial' });

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
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Gifted hands. Exquisite cuts.' })).toBeVisible();
  const cards = page.locator(
    '.exq-home__chairs .exq-chaircard[data-state]:not([data-state="loading"])',
  );
  await expect(cards.first()).toBeVisible();
  // Cards swap from loading to loaded one by one, so the count is polled rather than read once.
  await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(6);

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
  // No photos yet: the text hero stands alone, and the work section is hidden.
  await expect(page.locator('.exq-hero[data-state="text"]')).toBeVisible();
  await expect(page.locator('.exq-home__work')).toHaveCount(0);

  await page.goto('/services');
  await expectUp(page);
  await expect(page.locator('.exq-pricerow').first()).toBeVisible();

  await page.goto('/chairs');
  await expectUp(page);
  await expect(
    page.locator('.exq-chaircard .exq-photoframe[data-state="placeholder"]').first(),
  ).toBeVisible();

  await page.goto('/chairs/marcus');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Marcus', exact: true })).toBeVisible();
  await expect(page.locator('.exq-chair .exq-photoframe[data-state="placeholder"]')).toBeVisible();
  await expect(page.locator('.exq-chair__work')).toHaveCount(0);

  await page.goto('/gallery');
  await expectUp(page);
  await expect(page.locator('.exq-state[data-state="empty"]')).toBeVisible();

  await page.goto('/visit');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Find us', exact: true })).toBeVisible();

  await page.goto('/manage');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Manage your booking' })).toBeVisible();

  await page.goto('/book?barber=marcus');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeFocused();

  // No broken image anywhere on the way: every image that is on a page decoded.
  for (const path of ['/', '/chairs', '/chairs/marcus', '/visit']) {
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
  await page.goto('/book?barber=marcus');
  await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeFocused();
  await page.getByLabel(/Classic Cut/).click();
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
  await expect(page.locator('.exq-chairrow').first()).toBeVisible();

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
  await page.getByRole('link', { name: 'Marcus', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Photos of Marcus' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'marcus.png',
    mimeType: 'image/png',
    buffer: await pngBytes(page, 'MARCUS'),
  });
  await page
    .getByLabel('Describe the photo (alt text)')
    .fill('Marcus at his chair, showcase portrait');
  await page.getByRole('button', { name: 'Upload photo' }).click();
  await expect(
    page.locator('.exq-adm-photos__item img[alt="Marcus at his chair, showcase portrait"]'),
  ).toBeVisible();
  const stored = await page.locator('.exq-adm-photos__item img').first().getAttribute('src');
  expect(stored).toMatch(/\/api\/media\/[0-9a-f-]{36}\.webp$/);

  // A gallery photo credited to Marcus and a hero, through the same flow.
  const ids = await staffIds(page);
  await uploadSamplePhoto(page, {
    kind: 'gallery',
    staffId: ids.marcus ?? '',
    alt: 'A skin fade by Marcus',
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
  await page.goto('/chairs/marcus');
  const arch = page.locator('.exq-chair .exq-photoframe[data-state="loaded"] img');
  await expect(arch).toHaveAttribute('src', /\/api\/media\//);
  expect(await arch.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.exq-chair__work .exq-photo-grid__item').first()).toBeVisible();

  await page.goto('/gallery');
  const tile = page.locator('.exq-photo-grid__button img[alt="A skin fade by Marcus"]');
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
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  // The photos and the visitor's booking are gone; the sample shop is back.
  await page.goto('/admin/bookings');
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  await expect(page.locator('.exq-adm__content')).not.toContainText('Showcase Visitor');
  await expect(page.locator('.exq-adm__content')).toContainText(
    /Pat Placeholder|Sam Sample|Terry Testcase|Jamie Demo/,
  );
  await page.context().clearCookies();
  await page.goto('/chairs/marcus');
  await expect(page.locator('.exq-chair .exq-photoframe[data-state="placeholder"]')).toBeVisible();
  await page.goto('/gallery');
  await expect(page.locator('.exq-state[data-state="empty"]')).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.exq-hero[data-state="text"]')).toBeVisible();
  await expectUp(page);
  expect(errors).toEqual([]);
});
