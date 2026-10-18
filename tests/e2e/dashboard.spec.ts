import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { bookPublicly, signInOwner } from './owner';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

test.describe('the owner dashboard shell', () => {
  test('shows the sidebar, the top bar and every area at 1280', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    const nav = page.getByRole('navigation', { name: 'Dashboard', exact: true });
    for (const label of [
      'Overview',
      'Bookings',
      'Schedule',
      'Customers',
      'Team',
      'Website',
      'Settings',
    ]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    const side = page.locator('.exq-sidebar');
    const box = await side.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(248);
    await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Search, today's date and the primary button sit in the top bar.
    const top = page.locator('.exq-topbar');
    await expect(
      top.getByRole('combobox', { name: 'Search bookings and customers' }),
    ).toBeVisible();
    await expect(top.getByRole('button', { name: 'New booking' })).toBeVisible();
    // The tab bar is for phones only.
    await expect(page.getByRole('navigation', { name: 'Dashboard, mobile' })).toBeHidden();
  });

  test('shows the top bar, the menu button and a four tab bar at 390', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInOwner(page);
    await expect(page.locator('.exq-sidebar')).toBeHidden();
    const tabs = page.getByRole('navigation', { name: 'Dashboard, mobile' });
    await expect(tabs.getByRole('link')).toHaveCount(3);
    await tabs.getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet.getByRole('link', { name: 'Customers' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Website' })).toBeVisible();
    await sheet.getByRole('link', { name: 'Customers' }).click();
    await expect(page).toHaveURL(/\/admin\/customers$/);
  });

  test('"/" focuses the search, which finds a booking by code, phone and name, from the keyboard', async ({
    page,
    context,
  }) => {
    const { code, phone } = await bookPublicly(page, 'dee', { name: 'Zoë Searchable' });
    await context.clearCookies();
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.locator('body').click({ position: { x: 700, y: 400 } });
    await page.keyboard.press('/');
    const box = page.getByRole('combobox', { name: 'Search bookings and customers' });
    await expect(box).toBeFocused();

    // By code: exact.
    await box.fill(code);
    const list = page.getByRole('listbox');
    await expect(list.getByRole('option', { name: /Zoë Searchable/ }).first()).toBeVisible();
    // By the last four digits of the phone, in a different format.
    await box.fill(phone.slice(-4));
    await expect(list.getByRole('group', { name: 'Customers' })).toBeVisible();
    // By the start of the name without the accent, in capitals.
    await box.fill('ZOE SEARCH');
    await expect(list.getByRole('group', { name: 'Bookings' })).toBeVisible();
    // Down, Enter opens the booking.
    await box.press('ArrowDown');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/admin\/bookings\/[0-9a-f]{24}$/);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds nothing in the shell, ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('exq-theme', t);
      }, theme);
      await page.setViewportSize(DESKTOP);
      await signInOwner(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
    });
  }
});
