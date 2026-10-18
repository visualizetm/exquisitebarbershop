import { expect, test, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import { E2E_BARBER, E2E_OWNER } from '../../scripts/e2e-accounts';
import { myScheduleResponseSchema } from '../../shared/api/admin';
import { bookPublicly } from './owner';

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

test('a logged-out visit to /admin redirects to the sign in page', async ({ page }) => {
  await page.goto('/admin/schedule');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fschedule$/);
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  const api = await page.request.get('/api/admin/today');
  expect(api.status()).toBe(401);
});

test('a public booking shows as new for the owner, who marks it done and undoes it', async ({
  page,
  context,
}) => {
  const { code } = await bookPublicly(page, 'dee');
  await context.clearCookies();

  await signIn(page, E2E_OWNER);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  // It is flagged New in the list until the owner opens it.
  await page.goto('/admin/bookings');
  await expect(page.locator('.exq-table__new').first()).toBeVisible();

  // The search finds it by its code and opens the panel.
  await page.goto('/admin');
  const search = page.getByRole('combobox', { name: 'Search bookings and customers' });
  await search.fill(code);
  await page
    .getByRole('option', { name: /Admin Flow Customer/ })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name: 'Booking' });
  await expect(sheet.getByText(code)).toBeVisible();
  await sheet.getByRole('button', { name: 'Mark done' }).click();
  await expect(sheet.locator('.exq-status-chip[data-status="completed"]')).toBeVisible();
  // The toast offers Undo, and the history lists the change.
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(sheet.locator('.exq-status-chip[data-status="confirmed"]')).toBeVisible();
  await expect(sheet.getByText(/Status changed, by the owner/).first()).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.getByRole('button', { name: 'Block time' }).click();
  const panel = page.getByRole('dialog', { name: 'Block time' });
  await panel.getByLabel('Barber').selectOption({ label: 'Jay' });
  await panel.getByLabel('Day', { exact: true }).fill(local.toISODate() ?? '');
  await panel.getByLabel('From', { exact: true }).fill(local.toFormat('HH:mm'));
  await panel.getByLabel('To', { exact: true }).fill(local.plus({ hours: 1 }).toFormat('HH:mm'));
  await panel.getByRole('button', { name: 'Block this time' }).click();
  await expect(page.getByText('Time blocked.')).toBeVisible();

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
      return res.json() as Promise<unknown>;
    }),
  );
  expect(body.staff.slug).toBe('marcus');
  expect(body.days.flatMap((d) => d.bookings).every((b) => b.staff.slug === 'marcus')).toBe(true);
});
