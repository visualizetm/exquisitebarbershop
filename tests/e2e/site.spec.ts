import { expect, test, type Page } from '@playwright/test';
import { E2E_OWNER } from '../../scripts/e2e-accounts';
import { staffIds, uploadSamplePhoto } from './photos';

async function signInAsOwner(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Password').fill(E2E_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

test("the home strip shows today's chairs and each card books that chair", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gifted hands. Exquisite cuts.' })).toBeVisible();
  const cards = page.locator(
    '.exq-home__chairs .exq-chaircard[data-state]:not([data-state="loading"])',
  );
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(5);
  const lee = cards.filter({ hasText: 'Lee' });
  await expect(lee).toHaveAttribute('href', '/book?barber=lee');
  await expect(lee.locator('.exq-chaircard__badge')).toHaveText(/Chair \d\d/);
  await lee.click();
  await expect(page).toHaveURL(/\/book\?barber=lee/);
  await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeVisible();
});

test('a next-opening chip on the profile lands on the details step with that time', async ({
  page,
}) => {
  await page.goto('/chairs/lee');
  await expect(page.getByRole('heading', { name: 'Lee', exact: true })).toBeVisible();
  const chip = page.locator('.exq-chair__openings .exq-timechip').first();
  await expect(chip).toBeVisible();
  const startAt = (await chip.getAttribute('data-start')) ?? '';
  expect(startAt).not.toBe('');
  await chip.click();
  await expect(page).toHaveURL(/\/book\?.*barber=lee.*time=/);
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeFocused();
  await expect(page.locator('.exq-book-summary, .exq-booking-summary').first()).toContainText(
    'Lee',
  );
  // Backing up to the time step shows the chosen time selected.
  await page
    .getByRole('button', { name: /Pick a time|Time/ })
    .first()
    .click();
  await expect(
    page.locator(`.exq-time-option[data-state="selected"] button[data-start="${startAt}"]`),
  ).toBeVisible();
});

test('the gallery opens a photo in the lightbox with the barber and a book link', async ({
  page,
  context,
}) => {
  await signInAsOwner(page);
  const ids = await staffIds(page);
  await uploadSamplePhoto(page, {
    kind: 'gallery',
    staffId: ids.drew ?? '',
    alt: 'Design by Drew',
    label: 'DREW',
    color: '#C8102E',
  });
  await context.clearCookies();

  await page.goto('/gallery');
  await expect(page.getByRole('heading', { name: 'The work' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Drew/ }).first()).toBeVisible();
  const tile = page.locator('.exq-photo-grid__button', {
    has: page.locator('img[alt="Design by Drew"]'),
  });
  await tile.first().click();
  const dialog = page.locator('dialog.exq-dialog[open]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'By Drew' })).toBeVisible();
  await expect(dialog.locator('img[alt="Design by Drew"]').first()).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Book Drew' })).toHaveAttribute(
    'href',
    '/book?barber=drew',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // The home page shows the work section once a photo exists.
  await page.goto('/');
  await expect(page.locator('.exq-home__work .exq-photo-grid__item').first()).toBeVisible();
});

test('a profile page carries its own title, description, canonical and the shop JSON-LD', async ({
  page,
}) => {
  await page.goto('/chairs/lee');
  await expect(page.locator('.exq-chair__name')).toHaveText('Lee');
  await expect(page).toHaveTitle('Lee | Exquisite Barber & Beauty Lounge');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /^Lee, .* at Exquisite Barber & Beauty Lounge in Brookhaven, PA\./,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/chairs\/lee$/);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    /\/chairs\/lee$/,
  );
  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
  ) as { '@type': string; name: string; openingHoursSpecification: unknown[] };
  expect(jsonLd['@type']).toBe('BarberShop');
  expect(jsonLd.name).toBe('Exquisite Barber & Beauty Lounge');
  expect(jsonLd.openingHoursSpecification.length).toBeGreaterThan(0);

  // The sitemap built by the API lists the profile.
  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.headers()['content-type']).toContain('application/xml');
  expect(await sitemap.text()).toContain('/chairs/lee</loc>');
});
