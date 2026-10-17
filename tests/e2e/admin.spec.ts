import { expect, test, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import { E2E_BARBER, E2E_OWNER } from '../../scripts/e2e-accounts';
import { myScheduleResponseSchema } from '../../shared/api/admin';

const SHOP_ZONE = 'America/New_York';

/**
 * Status of a same-origin request made by the page itself. The session cookie is
 * Secure, so it only travels with requests the browser makes.
 */
async function statusFromPage(page: Page, path: string): Promise<number> {
  return page.evaluate(async (url) => (await fetch(url)).status, path);
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Books Classic Cut with a chair through the public flow; returns the code and start time. */
async function bookPublicly(
  page: Page,
  barber: string,
): Promise<{ code: string; startAt: string }> {
  await page.goto(`/book?barber=${barber}`);
  await page.getByLabel(/Classic Cut/).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.exq-day-option[data-state="available"] button').first().click();
  const first = page.locator('.exq-time-option button').first();
  const startAt = (await first.getAttribute('data-start')) ?? '';
  await first.click();
  await page.getByLabel('Name').fill('Admin Flow Customer');
  await page
    .getByLabel('Mobile phone')
    .fill(`215555${String(Math.floor(Math.random() * 9000) + 1000)}`);
  await page.getByRole('button', { name: 'Review booking' }).click();
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByRole('heading', { name: 'You are booked' })).toBeFocused();
  const code = (await page.locator('.exq-book-done__code').textContent()) ?? '';
  return { code: code.trim(), startAt };
}

test('a logged-out visit to /admin redirects to the sign in page', async ({ page }) => {
  await page.goto('/admin/schedule');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fschedule$/);
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  const api = await page.request.get('/api/admin/today');
  expect(api.status()).toBe(401);
});

test('a public booking shows as new for the owner, who marks it completed', async ({
  page,
  context,
}) => {
  const { code } = await bookPublicly(page, 'dee');
  await context.clearCookies();

  await signIn(page, E2E_OWNER);
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible();
  await expect(page.locator('.exq-adm-today__new')).toContainText('new online');

  await page.getByRole('link', { name: 'Bookings', exact: true }).click();
  await page.getByLabel('Search name, phone or reference').fill(code);
  await page.getByRole('button', { name: 'Show bookings' }).click();
  // The search by reference code narrows the list to this one booking.
  await expect(page.locator('.exq-adm-bookings__item')).toHaveCount(1);
  const row = page.locator('.exq-adm-bookings__item').filter({ hasText: 'Admin Flow Customer' });
  await expect(row).toHaveAttribute('data-new', 'true');
  await expect(row.locator('.exq-adm-bookings__new')).toHaveText('New');

  await row.getByRole('link').click();
  await expect(page.locator('.exq-adm-booking')).toHaveAttribute('data-state', 'confirmed');
  await page.getByRole('button', { name: 'Mark completed' }).click();
  await expect(page.locator('.exq-adm-booking')).toHaveAttribute('data-state', 'completed');
  await expect(page.locator('.exq-adm-booking__status')).toHaveText('Completed');
  // Opening it cleared the new flag, and the change can be undone.
  await expect(page.locator('.exq-adm-booking')).toHaveAttribute('data-new', 'false');
  await expect(page.getByRole('button', { name: 'Undo, back to confirmed' })).toBeVisible();
});

test('the owner blocks an hour and that time disappears from /book', async ({ page, browser }) => {
  // Find the first open time for Jay, as a customer would see it.
  await page.goto('/book?barber=jay');
  await page.getByLabel(/Classic Cut/).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.exq-day-option[data-state="available"] button').first().click();
  const startAt =
    (await page.locator('.exq-time-option button').first().getAttribute('data-start')) ?? '';
  expect(startAt).not.toBe('');
  const local = DateTime.fromISO(startAt, { zone: SHOP_ZONE });

  await signIn(page, E2E_OWNER);
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible();
  await page.getByRole('link', { name: 'Block time' }).click();
  await page.getByLabel('Chair').selectOption({ label: 'Jay' });
  await page.getByLabel('Day', { exact: true }).fill(local.toISODate() ?? '');
  await page.getByLabel('From', { exact: true }).fill(local.toFormat('HH:mm'));
  await page.getByLabel('To', { exact: true }).fill(local.plus({ hours: 1 }).toFormat('HH:mm'));
  await page.getByRole('button', { name: 'Block this time' }).click();
  await expect(page.locator('.exq-adm-blockform__done')).toContainText('Time blocked');

  // A new customer in a fresh browser: availability is cached for ten seconds per browser.
  const customer = await (await browser.newContext()).newPage();
  await customer.goto('/book?barber=jay');
  await customer.getByLabel(/Classic Cut/).click();
  await customer.getByRole('button', { name: 'Continue' }).click();
  await customer.locator('.exq-day-option[data-state="available"] button').first().click();
  await expect(customer.locator('.exq-time-picker')).toBeVisible();
  await expect(customer.locator('.exq-time-option').first()).toBeVisible();
  await expect(customer.locator(`.exq-time-option button[data-start="${startAt}"]`)).toHaveCount(0);
  // Nothing inside the blocked hour is offered either.
  for (const minutes of [15, 30, 45]) {
    const inside = local.plus({ minutes }).toUTC().toISO() ?? '';
    await expect(customer.locator(`.exq-time-option button[data-start="${inside}"]`)).toHaveCount(
      0,
    );
  }
  await customer.context().close();
});

test('a barber signs in and sees only their own schedule', async ({ page }) => {
  await signIn(page, E2E_BARBER);
  await expect(page).toHaveURL(/\/admin\/me/);
  await expect(page.getByRole('heading', { name: 'My schedule, Marcus' })).toBeVisible();
  const nav = page.locator('.exq-adm-nav__list a');
  await expect(nav).toHaveText(['My schedule', 'Account']);

  // Owner screens are not reachable, in the app or through the API.
  await page.goto('/admin/schedule');
  await expect(page).toHaveURL(/\/admin\/me$/);
  expect(await statusFromPage(page, '/api/admin/today')).toBe(403);
  expect(await statusFromPage(page, '/api/admin/bookings')).toBe(403);

  // A week view lists only Marcus's bookings.
  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.locator('.exq-adm-mine')).toHaveAttribute('data-view', 'week');
  await expect(page.locator('.exq-adm-mine__day')).toHaveCount(7);
  const body = myScheduleResponseSchema.parse(
    await page.evaluate(async () => {
      const res = await fetch('/api/me/schedule?days=7');
      return res.json();
    }),
  );
  expect(body.staff.slug).toBe('marcus');
  expect(body.days.flatMap((d) => d.bookings).every((b) => b.staff.slug === 'marcus')).toBe(true);
});
