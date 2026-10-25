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
      'Barber prices',
      'Reviews',
      'Overlays',
      'Motion',
    ];
    for (const name of sections) {
      // The kit block itself: the reviews editor inside the Reviews block is a region named
      // "Reviews" too, so the blocks are found by their own class.
      await expect(light.locator(`section.exq-kit__block[aria-label="${name}"]`)).toHaveCount(1);
      await expect(dark.locator(`section.exq-kit__block[aria-label="${name}"]`)).toHaveCount(1);
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

  test('the barber prices editor shows every state', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/kit');
    const block = page.locator(
      '[data-theme="light"].exq-kit__panel section.exq-kit__block[aria-label="Barber prices"]',
    );
    const editors = block.locator('.exq-priceedit');
    const first = editors.nth(0);
    const save = first.getByRole('button', { name: 'Save prices' });

    // Saved entries for two services, the third on the shop price, nothing changed yet.
    await expect(first).toHaveAttribute('data-state', 'idle');
    await expect(first.locator('.exq-priceedit__row[data-state="custom"]')).toHaveCount(2);
    await expect(first.locator('.exq-priceedit__row[data-state="shop"]')).toHaveCount(1);
    await expect(save).toBeDisabled();

    // A letter in a price is an error under the field, and Save stays off.
    const kids = first.getByLabel('Price in dollars for Kids Cut');
    await kids.fill('abc');
    await expect(first).toHaveAttribute('data-state', 'invalid');
    await expect(first.getByText('Enter dollars, for example 45 or 45.50')).toBeVisible();
    await expect(save).toBeDisabled();

    // A real price turns Save on; saving shows the loading state and then the toast.
    await kids.fill('25');
    await expect(first).toHaveAttribute('data-state', 'changed');
    await expect(first.locator('.exq-priceedit__row[data-state="custom"]')).toHaveCount(3);
    await save.click();
    await expect(first).toHaveAttribute('data-state', 'saving');
    await expect(page.getByText('Prices saved.').first()).toBeVisible();

    // "Use shop price" empties a custom row.
    await first.getByRole('button', { name: 'Use the shop price and time for Lineup' }).click();
    await expect(first.getByLabel('Price in dollars for Lineup')).toHaveValue('');

    // The second editor is refused by the server and keeps what was typed.
    const refused = editors.nth(1);
    await refused.getByLabel('Price in dollars for Haircut').fill('55');
    await refused.getByRole('button', { name: 'Save prices' }).click();
    await expect(refused.getByText('The prices were not saved. Try again.')).toBeVisible();
    await expect(refused.getByLabel('Price in dollars for Haircut')).toHaveValue('55');

    // The third barber has no services yet.
    const empty = editors.nth(2);
    await expect(empty).toHaveAttribute('data-state', 'empty');
    await expect(empty.getByRole('button', { name: 'Choose services' })).toBeVisible();
  });

  test('the rating line, the review cards and the reviews editor show every state', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/kit');
    const block = page.locator(
      '[data-theme="light"].exq-kit__panel section.exq-kit__block[aria-label="Reviews"]',
    );

    // RatingLine: with a rating and with the place id alone.
    const rated = block.locator('.exq-ratingline[data-state="rated"]');
    await expect(rated).toContainText('4.7 on Google from 15 reviews');
    await expect(rated.locator('.exq-stars')).toHaveAttribute('data-state', 'partial');
    await expect(rated.getByRole('link', { name: /Read them on Google/ })).toHaveAttribute(
      'href',
      /query_place_id=ChIJISdW6zTpxokRzSBEJjMQU4M/,
    );
    await expect(rated.getByRole('link', { name: /Leave a review/ })).toHaveAttribute(
      'href',
      /writereview\?placeid=ChIJISdW6zTpxokRzSBEJjMQU4M/,
    );
    const unrated = block.locator('.exq-ratingline[data-state="unrated"]');
    await expect(unrated).toHaveCount(1);
    await expect(unrated).not.toContainText('on Google from');
    await expect(unrated.getByRole('link', { name: /Leave a review/ })).toBeVisible();

    // ReviewCard: a dated Google review, an undated theCut one, five stars in words.
    const cards = block.locator('.exq-reviews .exq-review');
    await expect(cards).toHaveCount(3);
    await expect(block.locator('.exq-review__figure[data-state="dated"]')).toHaveCount(2);
    await expect(block.locator('.exq-review__figure[data-state="undated"]')).toHaveCount(1);
    await expect(cards.first()).toContainText('Google, September 2025');
    await expect(cards.first().getByText('Rated 5 out of 5')).toBeAttached();
    await expect(block.locator('.exq-reviews')).toHaveAttribute('data-count', '3');

    // ReviewsEditor: the site form starts idle, a bad rating is an error, a good one turns Save on.
    const editors = block.locator('.exq-reviewsedit');
    const first = editors.nth(0);
    const form = first.locator('form');
    const save = form.getByRole('button', { name: 'Save' });
    await expect(form).toHaveAttribute('data-state', 'idle');
    await expect(save).toBeDisabled();
    await expect(first.locator('.exq-reviewsedit__preview')).toHaveText(
      'The site says: 4.7 on Google from 15 reviews.',
    );
    const rating = form.getByLabel('Google rating');
    await rating.fill('abc');
    await expect(form).toHaveAttribute('data-state', 'invalid');
    await expect(
      form.getByText('A number from 1 to 5 with at most one decimal, for example 4.7'),
    ).toBeVisible();
    await expect(save).toBeDisabled();
    await rating.fill('4.8');
    await expect(form).toHaveAttribute('data-state', 'changed');
    await save.click();
    await expect(form).toHaveAttribute('data-state', 'saving');
    await expect(
      page.getByText('Reviews saved. The site shows them right away.').first(),
    ).toBeVisible();

    // The rows: shown and hidden, the Home tags, and Hide saves at once with a toast.
    await expect(first.locator('.exq-reviewrow[data-state="shown"]')).toHaveCount(2);
    await expect(first.locator('.exq-reviewrow[data-state="hidden"]')).toHaveCount(1);
    await expect(first.getByText('On Home', { exact: true })).toHaveCount(2);
    await first.getByRole('button', { name: 'Hide the review by Shamarr M.' }).click();
    await expect(
      page.getByText('The review by Shamarr M. is hidden from the site.').first(),
    ).toBeVisible();
    await expect(
      first.getByRole('button', { name: 'Move the review by Shamarr M. up' }),
    ).toBeDisabled();

    // The second editor is refused by the server; the third has no reviews and the section off.
    const refused = editors.nth(1);
    await refused.getByRole('button', { name: 'Hide the review by Shamarr M.' }).click();
    await expect(refused.getByText('The reviews were not saved. Try again.')).toBeVisible();
    const empty = editors.nth(2);
    await expect(empty.locator('section[data-state="empty"]')).toBeVisible();
    await expect(empty.getByText('No reviews yet')).toBeVisible();
    await expect(empty.locator('.exq-reviewsedit__preview')).toHaveAttribute(
      'data-state',
      'unrated',
    );

    // ReviewsPanel, the Website tab around the editor: loading and the settings not arriving.
    await expect(block.getByText('Loading the reviews')).toBeVisible();
    await expect(block.getByText('The reviews did not load')).toBeVisible();
  });
});
