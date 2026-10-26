import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_OWNER } from '../../scripts/e2e-accounts';

const INK = 'rgb(17, 17, 17)';
const PAPER = 'rgb(255, 255, 255)';

const pageBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
/** The switch fades colors for 150ms, so the final color is polled rather than read once. */
const expectBackground = (page: Page, color: string) =>
  expect.poll(() => pageBackground(page)).toBe(color);
const themeAttr = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const themeColor = (page: Page) =>
  page.evaluate(
    () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? '',
  );

async function signInAsOwner(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Password').fill(E2E_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

async function expectNoAxeViolations(page: Page, label: string) {
  // The home hero settles within 700ms; axe must read the colors it ends on, not a half faded frame.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`,
  );
  expect(summary, label).toEqual([]);
}

test('the choice persists across reloads and the theme color follows it', async ({ page }) => {
  await page.goto('/');
  expect(await themeAttr(page)).toBeNull();
  const button = page.getByRole('button', { name: /^Theme:/ });
  await expect(button).toHaveAttribute('aria-label', 'Theme: System');
  await button.click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(button).toHaveAttribute('aria-label', 'Theme: Dark');
  expect(await themeAttr(page)).toBe('dark');
  await expectBackground(page, INK);
  expect(await themeColor(page)).toBe('#111111');
  expect(await page.evaluate(() => localStorage.getItem('exq-theme'))).toBe('dark');

  await page.reload();
  expect(await themeAttr(page)).toBe('dark');
  await expectBackground(page, INK);
  await expect(page.getByRole('button', { name: 'Theme: Dark' })).toBeVisible();

  await page.getByRole('button', { name: 'Theme: Dark' }).click();
  await page.getByRole('menuitemradio', { name: 'Light' }).click();
  await expectBackground(page, PAPER);
  expect(await themeColor(page)).toBe('#FFFFFF');
  await page.reload();
  expect(await themeAttr(page)).toBe('light');
});

test('System follows the device scheme, and a saved Light choice overrides it', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(await themeAttr(page)).toBeNull();
  await expectBackground(page, INK);
  expect(await themeColor(page)).toBe('#111111');
  // The black mark is hidden in dark and the white one shows.
  await expect(page.locator('.exq-nav__logo-wide .exq-mark--dark')).toBeVisible();
  await expect(page.locator('.exq-nav__logo-wide .exq-mark--light')).toBeHidden();

  await page.emulateMedia({ colorScheme: 'light' });
  await expectBackground(page, PAPER);
  await expect(page.locator('.exq-nav__logo-wide .exq-mark--light')).toBeVisible();

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('button', { name: 'Theme: System' }).click();
  await page.getByRole('menuitemradio', { name: 'Light' }).click();
  await expectBackground(page, PAPER);
  await expect(page.locator('.exq-nav__logo-wide .exq-mark--light')).toBeVisible();
});

test('the first paint already carries the stored theme', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('exq-theme', 'dark');
  });
  await page.goto('/', { waitUntil: 'commit' });
  // Before any React code runs, the attribute and the meta are already set by the inline script.
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-theme'));
  expect(await themeAttr(page)).toBe('dark');
  expect(await themeColor(page)).toBe('#111111');
  expect(await page.evaluate(() => document.getElementById('root')?.childElementCount)).toBe(0);
});

test('the theme menu works from the keyboard alone', async ({ page }) => {
  await page.goto('/visit');
  const button = page.getByRole('button', { name: 'Theme: System' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Theme' })).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Theme' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Theme: Dark' })).toBeFocused();
  await expectBackground(page, INK);

  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Theme' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Theme: Dark' })).toBeFocused();

  // The mobile sheet and the admin Account page use the segmented control.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('radio', { name: 'Light' }).click();
  await expectBackground(page, PAPER);
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe passes in ${theme} on Home, Book and admin Overview`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('exq-theme', t);
    }, theme);
    await page.goto('/');
    await expect(page.locator('.exq-chaircard').first()).toBeVisible();
    await expectNoAxeViolations(page, `home ${theme}`);
    await page.goto('/book');
    await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeVisible();
    await expectNoAxeViolations(page, `book ${theme}`);
    await signInAsOwner(page);
    await expect(page.locator('.exq-chairrow').first()).toBeVisible();
    await expectNoAxeViolations(page, `admin overview ${theme}`);
    await page.goto('/admin/settings?tab=account');
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
    await expectNoAxeViolations(page, `admin account ${theme}`);
  });
}
