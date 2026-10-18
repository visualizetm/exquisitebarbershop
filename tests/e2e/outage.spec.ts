import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

/** Every API call answers 503, as when the database is down. */
async function stubApiDown(page: Page) {
  // Only the API: in development Vite serves shared/api/*.ts modules from a path with /api/ in it.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'DATABASE_UNAVAILABLE',
            message: 'The database is not reachable',
            requestId: 'stub',
          },
        }),
      }),
  );
}

test.describe('when the API is down', () => {
  test.use({ viewport: PHONE });

  test('public pages still show their words, the bar, the footer and Call, with a notice', async ({
    page,
  }) => {
    await stubApiDown(page);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Gifted hands. Exquisite cuts.' }),
    ).toBeVisible();
    await expect(page.locator('.exq-site-down')).toHaveCount(0);
    // The inline notice says what to do, and the data sections say they did not load.
    const notice = page.locator('.exq-outage');
    await expect(notice).toContainText('Some of this page could not load');
    await expect(notice.getByRole('link')).toHaveAttribute('href', /^tel:\+?\d+$/);
    await expect(page.getByText('The chairs did not load')).toBeVisible();
    await expect(page.getByText('The menu did not load')).toBeVisible();
    await expect(page.getByText('The shop details did not load')).toBeVisible();
    // The bottom bar, with its Call, and the footer are still there.
    const bar = page.getByRole('region', { name: 'Quick actions' });
    await expect(bar.getByRole('link', { name: 'Call' })).toHaveAttribute('href', /^tel:\+?\d+$/);
    await expect(page.locator('footer.exq-footer')).toBeVisible();

    // The other data pages keep their own words too.
    for (const path of ['/services', '/chairs', '/gallery', '/visit']) {
      await page.goto(path);
      await expect(page.locator('.exq-outage'), path).toBeVisible();
      await expect(page.locator('.exq-site-down'), path).toHaveCount(0);
      await expect(page.locator('h1').first(), path).toBeVisible();
      await expect(page.locator('footer.exq-footer'), path).toBeVisible();
    }
  });

  test('only booking shows the full message', async ({ page }) => {
    await stubApiDown(page);
    for (const path of ['/book', '/manage']) {
      await page.goto(path);
      await expect(page.locator('.exq-site-down'), path).toBeVisible();
      await expect(page.getByText('Online booking is having a moment'), path).toBeVisible();
      await expect(page.getByRole('link', { name: /^Call / }).first(), path).toHaveAttribute(
        'href',
        /^tel:/,
      );
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds nothing on the fallback, ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('exq-theme', t);
      }, theme);
      await stubApiDown(page);
      for (const path of ['/', '/visit', '/book']) {
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        await page.waitForFunction(() =>
          document.getAnimations().every((a) => a.playState !== 'running'),
        );
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(
          results.violations.map((v) => `${path} ${v.id}: ${v.nodes[0]?.html ?? ''}`),
          path,
        ).toEqual([]);
      }
    });
  }
});
