import { expect, test } from '@playwright/test';

/** A 1x1 transparent PNG, standing in for anything Cloudinary would deliver. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('a Cloudinary hero asks for exact sizes: four widths cropped 4:5, high priority, never lazy', async ({
  page,
}) => {
  const requested: string[] = [];
  await page.route('https://res.cloudinary.com/**', (route) => {
    requested.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
  });
  await page.route('**/api/shop', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    body.heroPhoto = {
      id: '0123456789abcdef01234567',
      url: 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1600/exquisite/test/hero-1',
      width: 1600,
      height: 2000,
      alt: 'The shop floor',
      delivery: { cloud: 'demo', publicId: 'exquisite/test/hero-1' },
    };
    await route.fulfill({ response, json: body });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const hero = page.locator('.exq-hero__photo img');
  await expect(hero).toBeVisible();
  await expect(hero).toHaveAttribute('fetchpriority', 'high');
  await expect(hero).toHaveAttribute('loading', 'eager');
  await expect(hero).toHaveAttribute('sizes', /480px, 100vw/);
  const srcset = (await hero.getAttribute('srcset')) ?? '';
  const parts = srcset.split(', ');
  expect(parts.map((p) => p.split(' ')[1])).toEqual(['400w', '800w', '1200w', '1600w']);
  for (const part of parts) {
    expect(part).toMatch(
      /^https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/f_auto,q_auto,c_fill,g_auto,w_\d+,ar_4:5\/exquisite\/test\/hero-1 \d+w$/,
    );
  }
  // At 390px the browser takes the 400 wide one.
  await expect.poll(() => requested.some((u) => u.includes('w_400,ar_4:5'))).toBe(true);
  expect(requested.some((u) => u.includes('w_1600'))).toBe(false);
});

test('photos below the fold lazy load', async ({ page }) => {
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  );
  await page.route('**/api/gallery**', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { photos: Record<string, unknown>[] };
    body.photos = [1, 2, 3].map((n) => ({
      id: `0123456789abcdef0123456${String(n)}`,
      url: `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1600/exquisite/test/g-${String(n)}`,
      width: 1200,
      height: 1200,
      alt: `Work ${String(n)}`,
      delivery: { cloud: 'demo', publicId: `exquisite/test/g-${String(n)}` },
      staff: null,
    }));
    await route.fulfill({ response, json: body });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const tile = page.locator('.exq-home__work .exq-photo-grid__item img').first();
  await expect(tile).toHaveAttribute('loading', 'lazy');
  expect(await tile.getAttribute('srcset')).toContain('ar_1:1');
  expect(await tile.getAttribute('fetchpriority')).toBeNull();
});
