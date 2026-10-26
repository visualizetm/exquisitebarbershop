import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  '/',
  '/services',
  '/chairs',
  '/chairs/lee',
  '/chairs/drew',
  '/chairs/iniya',
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
  for (const path of [
    '/',
    '/services',
    '/chairs',
    '/chairs/lee',
    '/chairs/drew',
    '/chairs/iniya',
    '/visit',
    '/book',
  ]) {
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
    await page.getByLabel(/^Haircut(?! and| with)/).click();
    await check('services');
    await bar.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Choose your chair' })).toBeVisible();
    await page.getByLabel(/Lee/).click();
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

/**
 * The photo states. The dev server stores no photos, so the shop's real photos from seed/photos stand
 * in for the hero and the gallery (the API answers are stubbed in the browser, nothing is written):
 * the hero photo behind the text, the Home work grid, the gallery chips and a chair's own work strip
 * (two photos credited to Drew) next to the "From the shop" strip (Lee).
 */
const SEED_PHOTOS = (
  JSON.parse(readFileSync(join('seed', 'photos', 'manifest.json'), 'utf8')) as {
    photos: { file: string; kind: string; alt: string; home?: boolean }[];
  }
).photos;

async function withPhotos(page: Page): Promise<void> {
  const res = await page.request.get('/api/staff');
  const origin = new URL(res.url()).origin;
  const body = (await res.json()) as { staff: { id: string; name: string; slug: string }[] };
  const drew = body.staff.find((s) => s.slug === 'drew');
  if (!drew) throw new Error('no Drew in /api/staff');
  const credit = { id: drew.id, name: drew.name, slug: drew.slug };
  const views = SEED_PHOTOS.map((photo, index) => ({
    id: (index + 1).toString(16).padStart(24, '0'),
    url: `${origin}/__seed-photos/${photo.file}`,
    width: 1200,
    height: 1600,
    alt: photo.alt,
    delivery: null,
    kind: photo.kind,
    home: photo.home === true,
  }));
  const gallery = views
    .filter((v) => v.kind === 'gallery')
    .map((v, index) => ({ ...v, staff: index < 2 ? credit : null }));
  const plain = (v: (typeof gallery)[number]) => ({
    id: v.id,
    url: v.url,
    width: v.width,
    height: v.height,
    alt: v.alt,
    delivery: v.delivery,
    staff: v.staff,
  });
  await page.route('**/__seed-photos/*', (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'image/webp',
      body: readFileSync(join('seed', 'photos', file)),
    });
  });
  await page.route('**/api/shop', async (route) => {
    const response = await route.fetch();
    const shop = (await response.json()) as Record<string, unknown>;
    const hero = views.find((v) => v.kind === 'hero');
    shop.heroPhoto = hero
      ? { id: hero.id, url: hero.url, width: 1200, height: 1600, alt: hero.alt, delivery: null }
      : null;
    await route.fulfill({ response, json: shop });
  });
  await page.route('**/api/gallery**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const staff = query.get('staff');
    const limit = Number(query.get('limit') ?? '24');
    let photos = staff ? gallery.filter((v) => v.staff?.slug === staff) : gallery;
    if (query.get('home') === 'true') {
      photos = [...photos.filter((v) => v.home), ...photos.filter((v) => !v.home)];
    }
    await route.fulfill({
      json: {
        photos: photos.slice(0, limit).map(plain),
        nextCursor: null,
        counts: [{ staffId: drew.id, slug: drew.slug, name: drew.name, count: 2 }],
        total: photos.length,
      },
    });
  });
}

const PHOTO_PAGES = ['/', '/gallery', '/chairs/drew', '/chairs/lee'];

/** The photo states really show, so the checks below are not passing on empty pages. */
async function expectPhotoState(page: Page, path: string): Promise<void> {
  if (path === '/') {
    await expect(page.locator('.exq-hero[data-state="photo"] .exq-hero__photo img')).toBeVisible();
    await expect(page.locator('.exq-home__work .exq-photo-grid__item')).toHaveCount(6);
  } else if (path === '/gallery') {
    await expect(page.locator('.exq-photo-grid__item').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^Drew/ }).first()).toBeVisible();
  } else if (path === '/chairs/drew') {
    await expect(page.locator('.exq-chair__work[data-state="own"] img').first()).toBeVisible();
  } else {
    await expect(page.locator('.exq-chair__work[data-state="shop"] img').first()).toBeVisible();
  }
}

test.describe('with the shop photos', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const size of SIZES) {
      test(`axe finds nothing on the photo pages, ${theme}, ${size.name}`, async ({ page }) => {
        await withPhotos(page);
        for (const path of PHOTO_PAGES) {
          await open(page, path, theme, size.width, size.height);
          await expectPhotoState(page, path);
          const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
          const found = results.violations.map(
            (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`,
          );
          expect(found, `${path} ${theme} ${size.name}`).toEqual([]);
        }
      });
    }
  }

  test('every photo has alt text and dimensions, and only the hero loads eagerly', async ({
    page,
  }) => {
    await withPhotos(page);
    for (const path of PHOTO_PAGES) {
      await open(page, path, 'light', 390, 844);
      await expectPhotoState(page, path);
      const photos = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLImageElement>('img[src*="__seed-photos"]')].map(
          (img) => ({
            alt: img.getAttribute('alt') ?? '',
            width: img.getAttribute('width'),
            height: img.getAttribute('height'),
            hero: img.closest('.exq-hero') !== null,
            loading: img.getAttribute('loading'),
            priority: img.getAttribute('fetchpriority'),
          }),
        ),
      );
      expect(photos.length, path).toBeGreaterThan(0);
      for (const photo of photos) {
        expect(photo.alt.trim(), path).not.toBe('');
        expect(photo.width && photo.height, path).toBeTruthy();
        if (photo.hero) expect(photo.priority, path).toBe('high');
      }
      if (path === '/') {
        expect(photos.filter((p) => !p.hero).every((p) => p.loading === 'lazy')).toBe(true);
      }
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`at 390 with the hero photo, ${theme}: the first screen reads white on the scrim, BOOK NOW included`, async ({
      page,
    }) => {
      await withPhotos(page);
      await open(page, '/', theme, 390, 844);
      await expectPhotoState(page, '/');
      const bar = await page.locator('.exq-bar').boundingBox();
      await expect(page.locator('.exq-bar').getByRole('link', { name: 'Book now' })).toBeVisible();
      const barTop = bar?.y ?? 0;
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
      // The next section peeks in above the bar.
      const hero = await page.locator('.exq-hero').boundingBox();
      expect((hero?.y ?? 0) + (hero?.height ?? 0)).toBeLessThan(barTop);
      // Every line of text over the photo is white or the light grey; the red display line is the
      // one accent. Inherited ink here made the title black on the scrim (prompt 12).
      const colors = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '.exq-hero__label, .exq-hero__title .exq-lines__text:not([data-accent="true"]), .exq-hero__sub, .exq-hero__info dt, .exq-hero__info dd',
          ),
        ].map((el) => getComputedStyle(el).color),
      );
      expect(colors.length).toBeGreaterThan(5);
      for (const color of colors)
        expect(['rgb(255, 255, 255)', 'rgb(217, 217, 217)']).toContain(color);
      // Red on the photo is the red for dark grounds (--red-on-dark, #FF5470) in both themes, never
      // #C8102E; with the 87% scrim it measures 4.5:1 or more on the real photo (D12-80).
      const accent = await page
        .locator('.exq-hero__title .exq-lines__text[data-accent="true"]')
        .evaluate((el) => getComputedStyle(el).color);
      expect(accent).toBe('rgb(255, 84, 112)');
    });
  }
});
