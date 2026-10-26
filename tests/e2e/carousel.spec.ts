import { expect, test } from '@playwright/test';

/** Today's chairs as a carousel on a phone: snap, dots, and the page still scrolls over it. */
test.describe("today's chairs carousel at 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a sideways move snaps to the next card, the dots follow, and the page scrolls over it', async ({
    page,
  }) => {
    await page.goto('/');
    const strip = page.locator('.exq-home__chairs .exq-chairs__list[data-state="ready"]');
    await expect(strip).toBeVisible();
    const cards = strip.locator(':scope > li');
    expect(await cards.count()).toBeGreaterThanOrEqual(5);
    const region = page.getByRole('region', { name: "Today's chairs carousel" });
    await expect(region).toBeVisible();
    const dots = region.getByRole('group', { name: 'Choose a chair to show' }).getByRole('button');
    await expect(dots).toHaveCount(await cards.count());
    await expect(dots.first()).toHaveAttribute('aria-current', 'true');
    // Tap targets.
    const dot = await dots.first().boundingBox();
    expect(dot?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(dot?.height ?? 0).toBeGreaterThanOrEqual(44);
    // The first card fills about 82% of the width and the next one peeks in.
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first?.width ?? 0).toBeGreaterThan(290);
    expect(second?.x ?? 0).toBeLessThan(390);

    // A sideways move that ends between two cards settles on the nearest one.
    await strip.scrollIntoViewIfNeeded();
    const stride = (second?.x ?? 0) - (first?.x ?? 0);
    await strip.evaluate((el, by) => {
      el.scrollBy({ left: by, behavior: 'auto' });
    }, stride * 0.7);
    await expect
      .poll(async () => strip.evaluate((el) => el.scrollLeft), { timeout: 5000 })
      .toBeCloseTo(stride, -1);
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(dots.first()).not.toHaveAttribute('aria-current', 'true');
    // The page did not move sideways.
    expect(await page.evaluate(() => window.scrollX)).toBe(0);

    // A dot shows its chair.
    await dots.nth(3).click();
    await expect
      .poll(async () => strip.evaluate((el) => el.scrollLeft))
      .toBeCloseTo(stride * 3, -1);
    await expect(dots.nth(3)).toHaveAttribute('aria-current', 'true');

    // Vertical scrolling over the strip still scrolls the page.
    const box = await strip.boundingBox();
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move((box?.x ?? 0) + 100, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(before + 100);
  });

  test('auto-advance moves to the next card and stops after a dot tap', async ({ page }) => {
    await page.goto('/');
    const strip = page.locator('.exq-home__chairs .exq-chairs__list[data-state="ready"]');
    await expect(strip).toBeVisible();
    await strip.scrollIntoViewIfNeeded();
    const dots = page.getByRole('group', { name: 'Choose a chair to show' }).getByRole('button');
    await expect(dots.first()).toHaveAttribute('aria-current', 'true');
    // Hands off: the strip moves on by itself within the interval.
    await page.mouse.move(5, 5);
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true', { timeout: 7000 });
    // After a tap it never moves again.
    await dots.nth(2).click();
    await expect(dots.nth(2)).toHaveAttribute('aria-current', 'true');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(5000);
    await expect(dots.nth(2)).toHaveAttribute('aria-current', 'true');
  });

  test('with reduced motion it never auto-advances', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto('/');
    const strip = page.locator('.exq-home__chairs .exq-chairs__list[data-state="ready"]');
    await expect(strip).toBeVisible();
    await strip.scrollIntoViewIfNeeded();
    const dots = page.getByRole('group', { name: 'Choose a chair to show' }).getByRole('button');
    await expect(dots.first()).toHaveAttribute('aria-current', 'true');
    await page.waitForTimeout(5000);
    await expect(dots.first()).toHaveAttribute('aria-current', 'true');
    await context.close();
  });
});
