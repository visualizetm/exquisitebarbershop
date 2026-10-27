import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { bookPublicly } from './owner';

/** Icons, the mobile header logo, the footer crest and social links, and the demo notice being off. */

test.describe('the header logo on a phone', () => {
  for (const width of [360, 390]) {
    test(`the stacked mark is about 170 by 40 and nothing scrolls sideways at ${String(width)}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const logo = page.locator('.exq-nav__logo-narrow img:visible').first();
      await expect(logo).toBeVisible();
      const box = await logo.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(38);
      expect(box?.height ?? 0).toBeLessThanOrEqual(42);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(160);
      expect(box?.width ?? 0).toBeLessThanOrEqual(178);
      // The menu button still fits on the same row.
      const toggle = await page.locator('.exq-nav__toggle').boundingBox();
      expect((toggle?.x ?? 0) + (toggle?.width ?? 0)).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    });
  }
});

test.describe('the footer', () => {
  test('uses the crest, and shows an icon only for a social link that is set', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const footer = page.locator('footer.exq-footer');
    await expect(footer.locator('img.exq-footer__crest:visible')).toHaveAttribute(
      'src',
      '/brand/exq-crest-white.svg',
    );
    const instagram = footer.getByRole('link', { name: 'Exquisite on Instagram' });
    await expect(instagram).toHaveAttribute('href', /^https:\/\/instagram\.com\//);
    await expect(instagram).toHaveAttribute('target', '_blank');
    await expect(instagram).toHaveAttribute('rel', /noopener/);
    const box = await instagram.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(instagram.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    // TikTok and Facebook are empty in the seed, so they are not there at all.
    await expect(footer.getByRole('link', { name: /Exquisite on (TikTok|Facebook)/ })).toHaveCount(
      0,
    );
  });
});

test.describe('icons', () => {
  test('name actions and facts: the bottom bar, the hero facts and the Visit page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const bar = page.getByRole('region', { name: 'Quick actions' });
    await expect(bar.getByRole('link', { name: 'Call' }).locator('svg')).toHaveCount(1);
    await expect(bar.getByRole('link', { name: 'Book now' }).locator('svg')).toHaveCount(1);
    const info = page.locator('.exq-hero__info');
    await expect(info.locator('dt svg')).toHaveCount(2);
    await page.goto('/visit');
    // Hours, address and phone. The email line has no icon while the shop has no real address.
    await expect(page.locator('.exq-visit__fact svg')).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Directions' }).locator('svg')).toHaveCount(1);
    // No icon sits on a heading.
    await expect(page.locator('h1 svg, h2 svg, h3 svg')).toHaveCount(0);
  });

  test('booking steps tick off, and the confirmation ticket names its facts', async ({ page }) => {
    await bookPublicly(page, 'drew', { name: 'Icon Check' });
    const ticket = page.locator('.exq-ticket');
    // Five facts, plus the launch offer row a first online booking carries.
    await expect(ticket.locator('dt svg')).toHaveCount(6);
    await expect(ticket.locator('dt', { hasText: 'Day' })).toBeVisible();
    await expect(ticket.locator('dt', { hasText: 'Time' })).toBeVisible();
    await page.goto('/book?barber=drew');
    await page.getByLabel(/^Haircut(?! and| with)/).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.locator('.exq-stepbar__step[data-state="done"] .exq-stepbar__n svg').first(),
    ).toBeVisible();
  });
});

test.describe('the demo notice is not part of a real shop', () => {
  test('no dialog opens on the public site, the staff sign in or the barber portal', async ({
    page,
  }) => {
    for (const path of ['/', '/book', '/admin/login', '/team']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('dialog[open]'), path).toHaveCount(0);
      await expect(page.getByText('This is a demo'), path).toHaveCount(0);
      await expect(page.getByText('Demo by Visualize Studio'), path).toHaveCount(0);
    }
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe finds nothing on the footer, header and home with the new icons, ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('exq-theme', t);
    }, theme);
    for (const size of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size);
      for (const path of ['/', '/visit']) {
        await page.goto(path);
        await expect(page.locator('footer.exq-footer')).toBeVisible();
        await page.waitForFunction(() =>
          document.getAnimations().every((a) => a.playState !== 'running'),
        );
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(
          results.violations.map(
            (v) => `${path} ${String(size.width)} ${v.id}: ${v.nodes[0]?.html ?? ''}`,
          ),
          path,
        ).toEqual([]);
      }
    }
  });
}
