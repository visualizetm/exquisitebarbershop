import { expect, test } from '@playwright/test';

/**
 * No public page scrolls sideways on a phone. Every element that reaches past the right edge is
 * named in the failure, so the cause is fixed at its source rather than hidden by overflow-x on body.
 */
const PAGES = [
  '/',
  '/services',
  '/chairs',
  '/chairs/drew',
  '/chairs/iniya',
  '/gallery',
  '/visit',
  '/book',
  '/book?barber=drew',
  '/manage',
];
const WIDTHS = [360, 390, 414];

for (const width of WIDTHS) {
  test(`nothing scrolls sideways at ${String(width)}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const report = await page.evaluate(() => {
        const limit = window.innerWidth;
        const wide: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > limit + 1) {
            const cls =
              el.className && typeof el.className === 'string'
                ? `.${el.className.split(' ')[0] ?? ''}`
                : '';
            wide.push(`${el.tagName.toLowerCase()}${cls} right=${String(Math.round(r.right))}`);
          }
        }
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: limit,
          wide: wide.slice(0, 8),
        };
      });
      expect(
        report.scrollWidth,
        `${path} at ${String(width)}: ${report.wide.join('; ')}`,
      ).toBeLessThanOrEqual(report.innerWidth);
    }
  });
}
