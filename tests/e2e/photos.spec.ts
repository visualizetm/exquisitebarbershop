import { expect, test, type Page } from '@playwright/test';
import { E2E_OWNER } from '../../scripts/e2e-accounts';

async function signInAsOwner(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Password').fill(E2E_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible();
}

/** A real PNG made in the browser, so the upload exercises the resize and WebP step. */
async function samplePng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 3000;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = '#C8102E';
    ctx.fillRect(0, 0, 2400, 3000);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('no blob'));
      }, 'image/png');
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

test('the owner uploads a chair photo through the Photos screen with the local driver', async ({
  page,
}) => {
  await signInAsOwner(page);
  const png = await samplePng(page);
  // Unique per run, so a reused server with earlier uploads never matches twice.
  const alt = `Tre at chair four ${Date.now()}`;
  await page.goto('/admin/photos');
  await page.getByRole('button', { name: 'Chairs' }).click();
  await page.getByLabel('Chair', { exact: true }).selectOption({ label: 'Tre' });
  await page.getByLabel('Choose a photo').setInputFiles({
    name: 'tre.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.getByLabel('Describe the photo (alt text)').fill(alt);
  await page.getByRole('button', { name: 'Upload photo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Photo added.' })).toBeVisible();
  const thumb = page.locator(`.exq-adm-photos__thumb[alt="${alt}"]`);
  await expect(thumb).toBeVisible();
  // The browser resized the 2400 by 3000 PNG to a 2000px long edge, as WebP.
  await expect(thumb).toHaveAttribute('width', '1600');
  await expect(thumb).toHaveAttribute('height', '2000');
  const src = (await thumb.getAttribute('src')) ?? '';
  expect(src).toMatch(/\/uploads\/staff\/[0-9a-f]{24}\/[0-9a-f-]{36}\.webp$/);
  const served = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return { status: res.status, type: res.headers.get('content-type') };
  }, src);
  expect(served).toEqual({ status: 200, type: 'image/webp' });

  // The portrait shown on the site is the first in the list: move the new one to the top.
  const row = page.locator('.exq-adm-photos__item', { has: thumb });
  for (let i = 0; i < 10; i += 1) {
    const first = await page
      .locator('.exq-adm-photos__item')
      .first()
      .locator('img')
      .getAttribute('alt');
    if (first === alt) break;
    await row.getByRole('button', { name: 'Up' }).click();
    await expect(page.locator('.exq-adm-photos__item').nth(i).locator('img')).not.toHaveAttribute(
      'alt',
      alt,
    );
  }
  await expect(page.locator('.exq-adm-photos__item').first().locator('img')).toHaveAttribute(
    'alt',
    alt,
  );

  // It is live on the site right away.
  await page.goto('/chairs/tre');
  await expect(page.locator('.exq-chair__photo img')).toHaveAttribute('alt', /^Tre at chair four/);
});
