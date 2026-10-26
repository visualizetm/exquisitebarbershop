import { expect, test } from '@playwright/test';

/** Prompt 13a at 390: the Visit map, Iniya's bar, and a chair page without a portrait. */
test.describe('prompt 13a at 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the Visit map is lazy, labeled, under the address, with Directions below, and the page scrolls over it', async ({
    page,
  }) => {
    await page.goto('/visit');
    const map = page.locator('.exq-visit__map');
    await expect(map).toBeVisible();
    const frame = map.locator('iframe');
    await expect(frame).toHaveAttribute('loading', 'lazy');
    await expect(frame).toHaveAttribute('title', /^Map to /);
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    const src = (await frame.getAttribute('src')) ?? '';
    expect(src).toMatch(/^https:\/\/www\.google\.com\/maps\?q=/);
    expect(src).toContain('output=embed');
    expect(decodeURIComponent(src)).toContain('3309 Edgmont Ave Suite F');
    // Fixed 4:3 frame.
    const box = await map.boundingBox();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(4 / 3, 1);
    // Directions sits right under the map.
    const order = await page.evaluate(() => {
      const m = document.querySelector('.exq-visit__map');
      const d = [...document.querySelectorAll('.exq-visit__actions a')].find((a) =>
        a.textContent.includes('Directions'),
      );
      return m && d ? m.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
    });
    expect(order).toBeTruthy();
    await expect(page.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      /google\.com\/maps/,
    );
    // A one-finger move over the map scrolls the page: the cover takes the gesture until tapped.
    await expect(map).toHaveAttribute('data-state', 'idle');
    await map.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    const b = await map.boundingBox();
    await page.mouse.move((b?.x ?? 0) + 150, (b?.y ?? 0) + (b?.height ?? 0) / 2);
    await page.mouse.wheel(0, 200);
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 50);
    // On a touch screen (hover: none) the cover shows and one tap hands over the map; with a mouse
    // (this runner) the cover is hidden by CSS and the map takes the pointer at once.
    const cover = map.getByRole('button', { name: 'Tap to move the map' });
    if (await cover.isVisible()) {
      await cover.click();
      await expect(map).toHaveAttribute('data-state', 'active');
    } else {
      expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(true);
    }
  });

  test("Iniya's bar says Call and Message on Instagram, never Book now", async ({ page }) => {
    await page.goto('/chairs/iniya');
    const bar = page.locator('.exq-bar');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Call' })).toHaveAttribute('href', /^tel:/);
    const insta = bar.getByRole('link', { name: 'Message on Instagram' });
    await expect(insta).toHaveAttribute('href', /instagram\.com\/iniyathestylist/);
    await expect(insta).toHaveAttribute('target', '_blank');
    await expect(insta).toHaveAttribute('rel', /noopener/);
    await expect(bar.getByText(/Book now/i)).toHaveCount(0);
  });

  test('a chair without a portrait shows the compact panel, and the name and Book fit in the first screen', async ({
    page,
  }) => {
    await page.goto('/chairs/drew');
    const frame = page.locator('.exq-chair__photo .exq-photoframe[data-state="placeholder"]');
    await expect(frame).toBeVisible();
    await expect(frame.locator('.exq-photoframe__number')).toHaveText(/^\d\d$/);
    await expect(frame.locator('.exq-photoframe__name')).toHaveText('Drew');
    const box = await frame.boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(844 * 0.4 + 2);
    const barTop = (await page.locator('.exq-bar').boundingBox())?.y ?? 844;
    for (const selector of [
      '.exq-chair__name',
      '.exq-chair__actions a[href="/book?barber=drew"]',
    ]) {
      const b = await page.locator(selector).boundingBox();
      expect(b, selector).not.toBeNull();
      expect((b?.y ?? 0) + (b?.height ?? 0), selector).toBeLessThanOrEqual(barTop);
    }
  });
});
