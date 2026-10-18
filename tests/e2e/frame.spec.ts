import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const PAGES = ['/', '/services', '/chairs', '/chairs/marcus', '/gallery', '/visit', '/book'];

async function toDetails(page: Page) {
  await page.goto('/book?barber=marcus');
  await page.getByLabel(/Classic Cut/).click();
  await page.locator('.exq-bar').getByRole('button', { name: 'Continue' }).click();
  await page.locator('.exq-day-option[data-state="available"] button').nth(1).click();
  await page.locator('.exq-time-option button').first().click();
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeFocused();
}

test.describe('the phone bottom bar', () => {
  test('shows CALL and BOOK NOW at 390, 60px tall with a red rule', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    const bar = page.getByRole('region', { name: 'Quick actions' });
    await expect(bar).toBeVisible();
    const call = bar.getByRole('link', { name: 'Call' });
    const book = bar.getByRole('link', { name: 'Book now' });
    await expect(call).toHaveAttribute('href', /^tel:\+?\d+$/);
    await expect(book).toHaveAttribute('href', '/book');
    const [a, b] = await Promise.all([call.boundingBox(), book.boundingBox()]);
    expect(a?.height).toBeGreaterThanOrEqual(60);
    expect(Math.abs((a?.width ?? 0) - (b?.width ?? 0))).toBeLessThan(2);
    expect(await bar.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('2px');
  });

  test('is hidden at 1280, in /setup and in /kit, and the header keeps a Book button', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await expect(page.locator('.exq-bar')).toBeHidden();
    await expect(page.locator('.exq-nav__book')).toBeVisible();
    await page.setViewportSize(PHONE);
    await page.goto('/setup');
    await expect(page.locator('.exq-bar')).toHaveCount(0);
    await page.goto('/kit');
    await expect(page.locator('.exq-bar[data-menu-inert]')).toHaveCount(0);
  });

  test('is not on the admin pages', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
    await expect(page.locator('.exq-bar')).toHaveCount(0);
  });

  test('on a barber profile the right half books that barber', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/chairs/marcus');
    const book = page.locator('.exq-bar').getByRole('link', { name: 'Book Marcus' });
    await expect(book).toBeVisible();
    await expect(book).toHaveAttribute('href', '/book?barber=marcus');
    await book.click();
    await expect(page).toHaveURL(/\/book\?barber=marcus/);
    await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeVisible();
    // Leaving the profile puts the default labels back.
    await page.goto('/services');
    await expect(page.locator('.exq-bar').getByRole('link', { name: 'Book now' })).toBeVisible();
  });

  test('in booking it is BACK and CONTINUE with the total above, then CONFIRM BOOKING', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/book?barber=marcus');
    const bar = page.locator('.exq-bar');
    await expect(bar.getByRole('link', { name: 'Back' })).toBeVisible();
    const next = bar.getByRole('button', { name: 'Continue' });
    await expect(next).toBeDisabled();
    await page.getByLabel(/Classic Cut/).click();
    await expect(next).toBeEnabled();
    await expect(bar.locator('.exq-bar__summary')).toContainText('$30');
    await expect(bar.locator('.exq-bar__summary')).toContainText('30 min');
    await next.click();
    await page.locator('.exq-day-option[data-state="available"] button').nth(1).click();
    await page.locator('.exq-time-option button').first().click();
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeFocused();
    // Back goes one step, with the choices kept.
    await bar.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Pick a time' })).toBeFocused();
    await bar.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Name').fill('Bar Customer');
    await page.getByLabel('Mobile phone').fill('2155550142');
    // The bar steps aside while the keyboard is up; closing the keyboard brings it back.
    await expect(bar).toBeHidden();
    await page.getByLabel('Mobile phone').blur();
    await bar.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Review and confirm' })).toBeFocused();
    await expect(bar.getByRole('button', { name: 'Confirm booking' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm booking' })).toHaveCount(1);
  });

  test('hides while a text field is focused on a phone and returns on blur', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await toDetails(page);
    const bar = page.locator('.exq-bar');
    await expect(bar).toHaveAttribute('data-state', 'shown');
    await page.getByLabel('Name').focus();
    await expect(bar).toHaveAttribute('data-state', 'hidden');
    await expect(bar).toBeHidden();
    await page.getByLabel('Name').blur();
    await expect(bar).toHaveAttribute('data-state', 'shown');
    await expect(bar).toBeVisible();
  });

  test('never covers the end of a page and keeps toasts above it', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/visit');
    await expect(page.locator('.exq-footer[data-state="ready"]')).toBeVisible();
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    const [footer, bar] = await Promise.all([
      page.locator('.exq-footer').boundingBox(),
      page.locator('.exq-bar').boundingBox(),
    ]);
    expect((footer?.y ?? 0) + (footer?.height ?? 0)).toBeLessThanOrEqual((bar?.y ?? 0) + 1);
    const barHeight = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bar-h'),
    );
    expect(parseFloat(barHeight)).toBeGreaterThanOrEqual(62);
    expect(
      await page.evaluate(() => {
        const toasts = document.querySelector('.exq-toasts');
        return toasts ? getComputedStyle(toasts).bottom : '0px';
      }),
    ).not.toBe('0px');
  });
});

test.describe('the frame', () => {
  test('the strip shows the announcement with a link, and the hamburger opens the ink menu', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    const strip = page.locator('.exq-topstrip[data-state="ready"]');
    await expect(strip).toContainText('Walk ins welcome');
    await expect(strip.getByRole('link', { name: 'Book online' })).toHaveAttribute('href', '/book');
    const toggle = page.getByRole('button', { name: 'Open menu' });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const menu = page.locator('#exq-mobile-nav');
    await expect(menu).toHaveAttribute('data-state', 'open');
    await expect(menu.getByRole('link', { name: 'The Chairs' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Call' })).toHaveAttribute('href', /^tel:/);
    await expect(menu.getByRole('link', { name: 'Book a chair' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('data-state', 'closed');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await menu.getByRole('link', { name: 'Services' }).click();
    await expect(page).toHaveURL(/\/services$/);
    await expect(menu).toHaveAttribute('data-state', 'closed');
  });

  test('the footer has no build text and no page has a staff link', async ({ page }) => {
    for (const width of [PHONE.width, DESKTOP.width]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator('.exq-footer[data-state="ready"]')).toBeVisible();
        expect(await page.locator('.exq-footer').innerText(), path).not.toMatch(/build/i);
        await expect(page.locator('a[href="/admin"], a[href^="/admin/"]'), path).toHaveCount(0);
        await expect(page.getByRole('link', { name: /staff/i }), path).toHaveCount(0);
      }
    }
  });
});
