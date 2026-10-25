import { expect, test } from '@playwright/test';

test.describe('the /kit page (development builds only)', () => {
  test('shows every section in both themes without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/kit');
    const light = page.locator('[data-theme="light"].exq-kit__panel');
    const dark = page.locator('[data-theme="dark"].exq-kit__panel');
    await expect(light).toBeVisible();
    await expect(dark).toBeVisible();
    const sections = [
      'Frame',
      'Buttons',
      'Fields',
      'Chips',
      'Cards',
      'Type and rows',
      'Photos and chairs',
      'Progress and ticket',
      'Feedback',
      'Dashboard',
      'Overlays',
      'Motion',
    ];
    for (const name of sections) {
      await expect(light.getByRole('region', { name, exact: true })).toHaveCount(1);
      await expect(dark.getByRole('region', { name, exact: true })).toHaveCount(1);
    }
    // The dark panel really is dark.
    const bg = await dark.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(17, 17, 17)');
    expect(errors).toEqual([]);
  });

  test('a sheet opens in 250ms and closes in 150ms, and the backdrop fades', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/kit');
    await page.getByRole('button', { name: 'Open sheet' }).first().click();
    const sheet = page.locator('dialog.exq-dialog[data-variant="sheet"][open]');
    await expect(sheet).toBeVisible();
    const open = await sheet.evaluate((el) => ({
      transition: getComputedStyle(el).transitionDuration,
      backdrop: getComputedStyle(el, '::backdrop').transitionDuration,
    }));
    expect(open.transition.split(',')[0]?.trim()).toBe('0.25s');
    expect(open.backdrop.split(',')[0]?.trim()).toBe('0.25s');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    const closed = await page
      .locator('dialog.exq-dialog[data-variant="sheet"]')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(closed.split(',')[0]?.trim()).toBe('0.15s');
  });

  test('a modal scales in and the lightbox swipes between photos', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/kit');
    await page.getByRole('button', { name: 'Open modal' }).first().click();
    const modal = page.locator('dialog.exq-dialog[data-variant="modal"][open]');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: 'Reset demo data?' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);

    await page.getByRole('button', { name: 'Open lightbox' }).first().click();
    const box = page.locator('dialog.exq-dialog[data-variant="lightbox"][open]');
    await expect(box.getByRole('heading', { name: 'By Lee' })).toBeVisible();
    await expect(box.getByRole('link', { name: 'Book Lee' })).toHaveAttribute(
      'href',
      '/book?barber=lee',
    );
    // Swiping is scrolling the snap track one slide.
    const track = box.locator('.exq-lightbox__track');
    await track.evaluate((el) => {
      el.scrollTo({ left: el.clientWidth, behavior: 'instant' });
    });
    await expect(box.getByRole('button', { name: 'Previous photo' })).toBeEnabled();
    await box.getByRole('button', { name: 'Next photo' }).click();
    await expect(box.getByRole('button', { name: 'Next photo' })).toBeDisabled();
  });
});
