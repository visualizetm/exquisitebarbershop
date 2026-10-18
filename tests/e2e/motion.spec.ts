import { expect, test } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

test.describe('motion', () => {
  test('the hero settles within 700ms and its heading never fades', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/motion-ready/);
    const heroAnimations = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          return target instanceof Element && target.closest('.exq-hero') !== null;
        })
        .map((a) => {
          const timing = a.effect?.getComputedTiming();
          return {
            end: Number(timing?.endTime ?? 0),
            name: (a as CSSAnimation).animationName,
          };
        }),
    );
    expect(heroAnimations.length).toBeGreaterThanOrEqual(7);
    expect(Math.max(...heroAnimations.map((a) => a.end))).toBeLessThanOrEqual(700);
    // The H1 text paints at full opacity; only its position moves.
    const lines = await page
      .locator('.exq-hero__title .exq-lines__text')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity));
    expect(lines).toEqual(['1', '1', '1', '1']);
    await expect(
      page.getByRole('heading', { name: /Gifted hands. Exquisite cuts./ }),
    ).toBeVisible();
  });

  test('below the fold starts hidden and reveals once; what is in view is never hidden', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.locator('.exq-home__chairs .exq-chaircard').first()).toBeVisible();
    // Nothing in the first screen carries a reveal state.
    expect(await page.locator('.exq-hero [data-reveal]').count()).toBe(0);
    const row = page.locator('.exq-home__services .exq-service').first();
    await expect(row).toHaveAttribute('data-reveal', 'hidden');
    expect(await row.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toHaveAttribute('data-reveal', 'shown');
    await expect.poll(() => row.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    // Scrolling away and back does not hide it again.
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expect(row).toHaveAttribute('data-reveal', 'shown');
  });

  test('with reduced motion nothing is hidden, nothing animates and no transform is set', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('.exq-home__services .exq-service').first()).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/motion-ready/);
    expect(await page.locator('[data-reveal]').count()).toBe(0);
    const state = await page.evaluate(() => {
      const transformed = [...document.body.querySelectorAll('*')].filter(
        (el) => getComputedStyle(el).transform !== 'none',
      );
      return {
        animations: document.getAnimations().length,
        transformed: transformed.map((el) => el.className.toString()),
        hidden: [...document.querySelectorAll('.exq-service')].filter(
          (el) => getComputedStyle(el).opacity !== '1',
        ).length,
      };
    });
    expect(state.animations).toBe(0);
    expect(state.transformed).toEqual([]);
    expect(state.hidden).toBe(0);
    // A press or hover is an instant color change, not a movement.
    const book = page.locator('.exq-hero__actions .exq-btn').first();
    await book.hover();
    expect(await book.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await context.close();
  });

  test('without IntersectionObserver the page is never hidden', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'IntersectionObserver');
    });
    await page.goto('/');
    await expect(page.locator('.exq-home__services .exq-service').first()).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/motion-ready/);
    expect(await page.locator('[data-reveal]').count()).toBe(0);
    expect(
      await page
        .locator('.exq-service')
        .first()
        .evaluate((el) => getComputedStyle(el).opacity),
    ).toBe('1');
    await context.close();
  });

  test('with JavaScript off the page still says how to book', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    const note = page.locator('.exq-noscript');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Online booking needs JavaScript');
    await expect(note.locator('a[href^="tel:"]')).toHaveText(/\(\d{3}\) \d{3}-\d{4}/);
    await context.close();
  });

  test('the home page shifts less than 0.1 while it loads and scrolls', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) w.__cls += shift.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/');
    await expect(page.locator('.exq-home__chairs .exq-chaircard').first()).toBeVisible();
    for (let y = 0; y < 4000; y += 400) {
      await page.evaluate((to) => {
        window.scrollTo(0, to);
      }, y);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(600);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls).toBeLessThan(0.1);
  });

  test('a link on the public site asks for a view transition', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: number };
      w.__vt = 0;
      const original = document.startViewTransition?.bind(document);
      if (original) {
        document.startViewTransition = ((cb?: () => void) => {
          w.__vt += 1;
          return original(cb);
        }) as typeof document.startViewTransition;
      }
    });
    await page.goto('/');
    const supported = await page.evaluate(() => 'startViewTransition' in document);
    test.skip(!supported, 'this browser has no View Transitions API');
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Services' })
      .click();
    await expect(page).toHaveURL(/\/services$/);
    await expect(page.getByRole('heading', { name: 'Services', level: 1 })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __vt: number }).__vt)).toBeGreaterThan(
      0,
    );
  });
});
