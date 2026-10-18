import { expect, test, type Page } from '@playwright/test';
import { PRODLIKE_OWNER } from '../../../scripts/e2e-accounts';

/**
 * The launch Rob is about to do: the production bundle over https with the
 * Vercel headers, production rules in the API, the exact variable set from
 * DEPLOY.md and no photo storage. Nothing here touches a real deployment.
 */
const BROKEN = 'https://127.0.0.1:4175';
const SECRET = 'prodlike-bootstrap-secret-0123456789abcdef';

test.describe.configure({ mode: 'serial' });

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

test('with DEMO_MODE off nothing of the showcase exists and nothing seeds itself', async ({
  page,
}) => {
  // An empty database and no setup yet: the shop answers "not set up" instead of seeding itself.
  const shop = await page.request.get('/api/shop');
  expect(shop.status()).toBe(503);
  expect(((await shop.json()) as { error: { code: string } }).error.code).toBe('CONFIG_ERROR');
  expect(shop.headers()['x-robots-tag']).toBeUndefined();
  const login = await page.request.post('/api/auth/demo-login', { data: {} });
  expect(login.status()).toBe(404);
  const reset = await page.request.post('/api/admin/demo/reset', { data: {} });
  expect(reset.status()).toBe(404);
  // GridFS photos are not available either: the media address does not exist for this driver.
  expect(
    (await page.request.get('/api/media/0f8fad5b-d9cb-469f-a165-70867728950e.webp')).status(),
  ).toBe(404);
  const html = await (await page.request.get('/')).text();
  expect(html).not.toContain('name="robots"');
  expect(await (await page.request.get('/robots.txt')).text()).not.toMatch(/^Disallow: \/$/m);

  // The down screen names the error code, and nothing else, in a Details disclosure.
  await page.goto('/');
  const down = page.locator('.exq-site-down[data-state="down"]');
  await expect(down).toBeVisible();
  await down.locator('summary').click();
  await expect(down.locator('.exq-site-down__code')).toHaveText('CONFIG_ERROR');
  expect(await down.innerText()).not.toMatch(/mongodb|secret|password/i);
});

test('a missing MONGODB_URI shows the down message and the health check names it', async ({
  page,
}) => {
  const health = await page.request.get(`${BROKEN}/api/health`);
  expect(health.status()).toBe(503);
  const body = (await health.json()) as { ok: boolean; missing?: string[] };
  expect(body.ok).toBe(false);
  expect(body.missing).toEqual(['MONGODB_URI']);
  expect(JSON.stringify(body)).not.toContain('mongodb://');

  await page.goto(`${BROKEN}/`);
  const down = page.locator('.exq-site-down[data-state="down"]');
  await expect(down).toBeVisible();
  await expect(down.locator('.exq-state__title')).toHaveText('Online booking is having a moment');
  await expect(down.getByText("Call the shop and we'll get you in.")).toBeVisible();
  await down.locator('summary').click();
  await expect(down.locator('.exq-site-down__code')).toHaveText('CONFIG_ERROR');
  await expect(down.getByRole('link', { name: /^Call/ })).toHaveAttribute('href', /^tel:/);

  // The setup page still works there, so the doctor can say what is missing.
  await page.goto(`${BROKEN}/setup`);
  await expect(page.getByRole('heading', { name: 'Set up the site' })).toBeVisible();
  await page.getByLabel('Setup secret (BOOTSTRAP_SECRET)').fill(SECRET);
  await page.getByRole('button', { name: 'Run doctor' }).click();
  const list = page.locator('.exq-setup__list');
  await expect(list.locator('.exq-setup__check[data-state="fail"]').first()).toBeVisible();
  await expect(page.getByText(/Setting MONGODB_URI/)).toBeVisible();
});

test('setup runs the doctor and setup on the production bundle', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Set up the site' })).toBeVisible();
  await page.getByLabel('Setup secret (BOOTSTRAP_SECRET)').fill(SECRET);
  await page.getByRole('button', { name: 'Run doctor' }).click();
  const list = page.locator('.exq-setup__list');
  await expect(list.locator('.exq-setup__check')).not.toHaveCount(0);
  await expect(page.getByText('Database: The database answers.')).toBeVisible();
  // A fresh database: only the three rows that setup itself fixes read Fix. A server
  // reused from an earlier run already has them, so the run is forced instead.
  const failing = list.locator('.exq-setup__check[data-state="fail"]');
  const fresh = (await failing.count()) > 0;
  if (fresh) {
    await expect(failing).toHaveCount(3);
    await expect(failing).toContainText([/Indexes/, /Shop data/, /Owner login/]);
  }
  // Storage, the public URL, backups and email read Check, with the R2 pointer.
  await expect(list.locator('.exq-setup__check[data-state="warn"]')).toHaveCount(4);
  await expect(page.getByText(/Set up Cloudflare R2/).first()).toBeVisible();

  if (!fresh) await page.getByRole('checkbox', { name: /Run setup again/ }).check();
  await page.getByRole('button', { name: 'Run setup' }).click();
  await expect(page.getByRole('heading', { name: /Setup ran/ })).toBeVisible();
  await expect(
    page.getByText(fresh ? /Owner login: created/ : /Owner login: exists/),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Run doctor' }).click();
  await expect(list.locator('.exq-setup__check[data-state="fail"]')).toHaveCount(0);
  await expect(list.locator('.exq-setup__check[data-state="warn"]')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('every public page loads fully with placeholders and no console errors', async ({ page }) => {
  const errors = watchConsole(page);
  const healthy = await page.request.get('/api/health');
  expect(healthy.status()).toBe(200);
  expect(((await healthy.json()) as { ok: boolean }).ok).toBe(true);

  await page.goto('/');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Gifted hands. Exquisite cuts.' })).toBeVisible();
  // The ink hero and the initials placeholders stand in for photos; nothing looks unfinished.
  await expect(page.locator('.exq-hero[data-state="text"]')).toBeVisible();
  await expect(page.locator('.exq-home__work')).toHaveCount(0);
  await expect(page.locator('.exq-nav__logo-wide .exq-mark--light')).toBeVisible();
  await expect(page.locator('.exq-nav__logo-narrow .exq-mark--light')).toBeHidden();
  // Nothing is focused on first paint, so no ring shows.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

  await page.goto('/services');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeVisible();
  await expect(page.locator('.exq-pricerow').first()).toBeVisible();

  await page.goto('/chairs');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Pick your chair' })).toBeVisible();
  const cards = page.locator('.exq-chaircard[data-state]:not([data-state="loading"])');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(6);

  await page.goto('/chairs/marcus');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Marcus', exact: true })).toBeVisible();
  await expect(page.locator('.exq-chair .exq-photoframe[data-state="placeholder"]')).toBeVisible();
  await expect(page.locator('.exq-chair__work')).toHaveCount(0);

  await page.goto('/gallery');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'The work' })).toBeVisible();
  await expect(page.locator('.exq-state[data-state="empty"]')).toBeVisible();
  await expect(page.locator('.exq-photo-grid__item')).toHaveCount(0);

  await page.goto('/visit');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Find us', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Call/ })).toBeVisible();

  await page.goto('/manage');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Manage your booking' })).toBeVisible();

  await page.goto('/book?barber=marcus');
  await expectUp(page);
  await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeFocused();
  await page.getByLabel(/Classic Cut/).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Pick a day' })).toBeFocused();
  await page.locator('.exq-day-option[data-state="available"] button').first().click();
  await expect(page.getByRole('heading', { name: 'Pick a time' })).toBeFocused();
  await page.locator('.exq-time-option button').first().click();
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeFocused();
  await expect(page.locator('.exq-book-summary, .exq-booking-summary').first()).toContainText(
    'Marcus',
  );

  // The security headers from vercel.json are on every response, pages and API alike.
  for (const path of ['/', '/api/shop']) {
    const res = await page.request.get(path);
    expect(res.headers()['content-security-policy'], path).toContain("default-src 'self'");
    expect(res.headers()['x-frame-options'], path).toBe('DENY');
  }
  expect(errors).toEqual([]);
});

test('a route change moves focus to the page heading without a ring, and keyboard focus still shows', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Services' }).first().click();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.querySelector(':focus-visible') === null)).toBe(true);
  await expect(page.locator('.exq-nav__link > span[data-state="active"]')).toHaveText('Services');

  // A keyboard user sees the ring on the next control they reach.
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const el = document.querySelector(':focus-visible');
    return el ? getComputedStyle(el).outlineStyle : 'none';
  });
  expect(ring).not.toBe('none');
  expect(errors).toEqual([]);
});

test('the owner signs in and the Photos screen says storage is not set up', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  await expect(page.locator('.exq-site-down')).toHaveCount(0);
  // A real shop has no demo button and no demo banner.
  await expect(page.getByRole('button', { name: 'Enter demo dashboard' })).toHaveCount(0);
  await expect(page.getByText('Demo mode.')).toHaveCount(0);
  await page.getByLabel('Email').fill(PRODLIKE_OWNER.email);
  await page.getByLabel('Password').fill(PRODLIKE_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible();
  await expect(page.locator('.exq-adm-nav__logo.exq-mark--light')).toHaveAttribute(
    'src',
    '/brand/exq-stacked-black.svg',
  );

  await page.goto('/admin/photos');
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  const empty = page.locator('.exq-adm-photos-page[data-state="disabled"] .exq-state');
  await expect(empty).toContainText("Photo storage isn't set up yet.");
  await expect(empty).toContainText("Photos can be added once it's connected.");
  await expect(page.getByRole('button', { name: 'Upload photo' })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);

  // The API says the same thing to anything that tries anyway (the request context shares the cookie).
  const tried = await page.request.post('/api/admin/photos/upload-url', {
    data: { kind: 'hero', contentType: 'image/webp', size: 1000 },
  });
  const status = {
    status: tried.status(),
    code: ((await tried.json()) as { error: { code: string } }).error.code,
  };
  expect(status).toEqual({ status: 503, code: 'STORAGE_DISABLED' });

  // Signing in left no 401 behind, and the day loaded.
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible();
  expect(errors).toEqual([]);
});
