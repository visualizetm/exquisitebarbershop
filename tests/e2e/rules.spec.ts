import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  '/',
  '/services',
  '/chairs',
  '/chairs/marcus',
  '/gallery',
  '/visit',
  '/book',
  '/manage',
];
const SIZES = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
];

async function open(
  page: Page,
  path: string,
  theme: 'light' | 'dark',
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await page.addInitScript((t) => {
    localStorage.setItem('exq-theme', t);
  }, theme);
  await page.goto(path);
  await expect(page.locator('main')).toBeVisible();
  // The shop settings and the page's own data have loaded when the footer shows the hours.
  await expect(page.locator('.exq-footer[data-state="ready"]')).toBeVisible();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  // Scroll the page through so every reveal has played and everything is on screen.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

for (const theme of ['light', 'dark'] as const) {
  for (const size of SIZES) {
    test(`axe finds nothing on any public page, ${theme}, ${size.name}`, async ({ page }) => {
      for (const path of PAGES) {
        await open(page, path, theme, size.width, size.height);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        const found = results.violations.map(
          (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`,
        );
        expect(found, `${path} ${theme} ${size.name}`).toEqual([]);
      }
    });
  }
}

test('only the six type sizes appear on public pages', async ({ page }) => {
  const allowed: Record<string, number[]> = {
    // label, body, h3 and price, h2, display (a clamp of the viewport on phones)
    '390': [13, 17, 22, 36, 52],
    '1280': [13, 18, 22, 26, 56, 96],
  };
  for (const size of SIZES) {
    for (const path of PAGES) {
      await open(page, path, 'light', size.width, size.height);
      const sizes = await page.evaluate(() => {
        const found = new Map<number, string>();
        for (const el of document.querySelectorAll('main *, header *, footer *')) {
          const own = [...el.childNodes].some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
          );
          if (!own) continue;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const px = Math.round(parseFloat(style.fontSize) * 10) / 10;
          if (!found.has(px)) found.set(px, el.getAttribute('class') ?? el.tagName);
        }
        return [...found.entries()];
      });
      const okSizes = allowed[size.name] ?? [];
      const stray = sizes.filter(([px]) => !okSizes.some((a) => Math.abs(a - px) < 1.6));
      expect(stray, `${path} at ${size.name}`).toEqual([]);
    }
  }
});

test('tap targets are 44px or larger on a phone', async ({ page }) => {
  for (const path of ['/', '/services', '/chairs', '/chairs/marcus', '/visit', '/book']) {
    await open(page, path, 'light', 390, 844);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll(
        'a[href], button, input, select, textarea, summary',
      )) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if ((el as HTMLInputElement).type === 'hidden' || el.closest('.exq-field--trap')) continue;
        // A link inside a sentence is exempt; so is a checkbox or radio whose card is the target.
        if (el.tagName === 'A' && el.closest('p') && style.display === 'inline') continue;
        if (el.classList.contains('exq-option__input')) continue;
        if (el.closest('[inert]') || el.closest('.exq-menu')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 43.5 || r.width < 43.5) {
          out.push(
            `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''} ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }
      return out;
    });
    expect(small, path).toEqual([]);
  }
});

test('every public image has alt text and dimensions', async ({ page }) => {
  for (const path of PAGES) {
    await open(page, path, 'light', 390, 844);
    const bad = await page.evaluate(() =>
      [...document.images]
        .filter(
          (img) =>
            !img.hasAttribute('alt') || !img.getAttribute('width') || !img.getAttribute('height'),
        )
        .map((img) => img.src),
    );
    expect(bad, path).toEqual([]);
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe finds nothing on any booking step, ${theme}, 390`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((t) => {
      localStorage.setItem('exq-theme', t);
    }, theme);
    const check = async (label: string) => {
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== 'running'),
      );
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`,
        ),
        label,
      ).toEqual([]);
    };
    const bar = page.locator('.exq-bar');
    await page.goto('/book');
    await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeVisible();
    await page.getByLabel(/Classic Cut/).click();
    await check('services');
    await bar.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Choose your chair' })).toBeVisible();
    await page.getByLabel(/Marcus/).click();
    await check('barber');
    await bar.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Pick a day' })).toBeVisible();
    await check('day');
    await page.locator('.exq-day-option[data-state="available"] button').nth(1).click();
    await expect(page.getByRole('heading', { name: 'Pick a time' })).toBeVisible();
    await check('time');
    await page.locator('.exq-time-option button').first().click();
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await check('details');
    await page.getByLabel('Name').fill('Axe Customer');
    await page
      .getByLabel('Mobile phone')
      .fill(`215555${String(Math.floor(Math.random() * 9000) + 1000)}`);
    await page.getByLabel('Mobile phone').blur();
    await bar.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Review and confirm' })).toBeVisible();
    await check('confirm');
    await bar.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('heading', { name: 'You are booked' })).toBeVisible();
    await check('done');
  });
}

test('at 390 the hero label, heading, sub line and both buttons show without scrolling, bar included', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.exq-footer[data-state="ready"]')).toBeVisible();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  const barTop = (await page.locator('.exq-bar').boundingBox())?.y ?? 0;
  for (const selector of [
    '.exq-hero__label',
    '.exq-hero__title',
    '.exq-hero__sub',
    '.exq-hero__actions .exq-btn >> nth=0',
    '.exq-hero__actions .exq-btn >> nth=1',
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0), selector).toBeLessThanOrEqual(barTop);
  }
  // The next section peeks in under the info row: the hero is not 100vh.
  const hero = await page.locator('.exq-hero').boundingBox();
  expect(hero?.height ?? 0).toBeLessThan(844 + 400);
});
