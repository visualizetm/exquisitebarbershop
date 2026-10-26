import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { randomPhone, resetRateLimits, signInOwner } from './owner';

/*
 * Barbers charge different prices for the same service. The shop price and time are the defaults;
 * a person's own entries replace them. These checks run against the e2e server, seeded from
 * seed/shop.ts: Dontrise takes 75 minutes and charges $50 for a haircut, Nelly charges $45, Drew
 * charges $25 for a kids cut, Lee uses the shop prices.
 */

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const HAIRCUT = /^Haircut(?! and| with)/;
/** What a haircut costs with each person, for the "first available" check. */
const HAIRCUT_TOTAL: Record<string, string> = {
  Dontrise: '$50',
  Lee: '$40',
  Drew: '$40',
  'Nelly Cutz': '$45',
};

/** A price row's link; its name carries the service, the minutes and the price. */
function rowLink(page: Page, name: string) {
  return page.getByRole('link', { name });
}

const serviceOption = (page: Page, name: RegExp) =>
  page.locator('.exq-service-option').filter({ hasText: name });

test.describe('the price list', () => {
  test('/services shows "from" where barbers differ or the shop says so, and a plain price otherwise', async ({
    page,
  }) => {
    await page.goto('/services');
    await expect(page.getByRole('heading', { name: 'Services', level: 1 })).toBeVisible();
    // Flagged "from" and barbers differ: the lowest, with that person's time.
    await expect(rowLink(page, 'Book Haircut, 45 minutes, From $40')).toBeVisible();
    await expect(rowLink(page, 'Book Kids Cut, 30 minutes, From $20')).toBeVisible();
    await expect(rowLink(page, 'Book Lineup, 20 minutes, From $20')).toBeVisible();
    await expect(rowLink(page, 'Book Color and Cut, 90 minutes, From $65')).toBeVisible();
    // Not flagged and everyone who does it charges the same: a plain price.
    await expect(rowLink(page, 'Book Haircut and Beard, 45 minutes, $45')).toBeVisible();
    await expect(rowLink(page, 'Book Perm with Cut, 150 minutes, $150')).toBeVisible();
    // Only one person does it, with their own price and time: plain, and not the shop's 60 minutes.
    await expect(rowLink(page, 'Book Kids Cut with Design, 90 minutes, $40')).toBeVisible();
  });

  test('a chair page shows that barber\'s own exact prices and times, never "From"', async ({
    page,
  }) => {
    await page.goto('/chairs/dontrise');
    await expect(rowLink(page, 'Book Haircut with Dontrise, 75 minutes, $50')).toBeVisible();
    await expect(rowLink(page, 'Book Lineup with Dontrise, 40 minutes, $30')).toBeVisible();
    await expect(
      rowLink(page, 'Book Color and Cut with Dontrise, 180 minutes, $100'),
    ).toBeVisible();
    await page.goto('/chairs/nelly');
    await expect(rowLink(page, 'Book Haircut with Nelly Cutz, 45 minutes, $45')).toBeVisible();
    await page.goto('/chairs/drew');
    await expect(rowLink(page, 'Book Kids Cut with Drew, 30 minutes, $25')).toBeVisible();
    await expect(rowLink(page, 'Book Haircut with Drew, 45 minutes, $40')).toBeVisible();
    await expect(page.locator('.exq-chair')).not.toContainText(/From \$/);
    await page.goto('/chairs/lee');
    await expect(rowLink(page, 'Book Haircut with Lee, 45 minutes, $40')).toBeVisible();
  });
});

test.describe('booking with a barber', () => {
  test("a chosen barber's price and time run through the steps and the ticket", async ({
    page,
  }) => {
    await resetRateLimits();
    await page.goto('/book?barber=dontrise');
    // A chosen barber's price is exact: no "From", even for a service the shop menu marks "from".
    await expect(serviceOption(page, HAIRCUT)).toContainText('$50');
    await expect(serviceOption(page, HAIRCUT)).not.toContainText('From');
    await expect(serviceOption(page, HAIRCUT)).toContainText('75 min');
    await page.getByLabel(HAIRCUT).click();
    await expect(page.locator('.exq-service-picker__total')).toContainText(
      '1 selected: $50, about 75 minutes.',
    );
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('.exq-day-option[data-state="available"] button').nth(1).click();
    await page.locator('.exq-time-option button').first().click();
    await page.getByLabel('Name').fill('Price Customer');
    await page.getByLabel('Mobile phone').fill(randomPhone());
    await page.getByRole('button', { name: 'Review booking' }).click();
    await expect(page.locator('.exq-book-card__total')).toContainText('$50');
    await expect(page.locator('.exq-book-card__total')).not.toContainText('From');
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('heading', { name: 'You are booked' })).toBeFocused();
    await expect(page.locator('.exq-ticket__total')).toContainText('$50');
    await expect(page.locator('.exq-ticket')).toContainText('Dontrise');
  });

  test('first available shows a "from" total, then the ticket shows the assigned barber\'s price', async ({
    page,
  }) => {
    await resetRateLimits();
    await page.goto('/book');
    await page.getByLabel(HAIRCUT).click();
    // Before anyone is chosen the row is the lowest price among the people who do it.
    await expect(page.locator('.exq-service-picker__total')).toContainText(
      '1 selected: From $40, about 45 minutes.',
    );
    await page.getByRole('button', { name: 'Continue' }).click();
    // The barber step shows what the haircut comes to with each person.
    const option = (name: RegExp) => page.locator('.exq-staff-option').filter({ hasText: name });
    await expect(option(/^Dontrise/)).toContainText('$50');
    await expect(option(/^Nelly Cutz/)).toContainText('$45');
    await expect(option(/^Anyone available/)).toContainText('From $40');
    await page.getByLabel(/^Anyone available/).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('.exq-day-option[data-state="available"] button').nth(1).click();
    await page.locator('.exq-time-option button').first().click();
    await page.getByLabel('Name').fill('Anyone Customer');
    await page.getByLabel('Mobile phone').fill(randomPhone());
    await page.getByRole('button', { name: 'Review booking' }).click();
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('heading', { name: 'You are booked' })).toBeFocused();
    const chair = (await page.locator('.exq-ticket').textContent()) ?? '';
    const barber = Object.keys(HAIRCUT_TOTAL).find((name) => chair.includes(`${name} (first`));
    expect(barber, chair).toBeDefined();
    await expect(page.locator('.exq-ticket__total')).toHaveText(
      new RegExp(`${(HAIRCUT_TOTAL[barber ?? ''] ?? '').replace('$', '\\$')}$`),
    );
  });
});

test.describe('the Prices tab in Team', () => {
  async function openPrices(page: Page, name: string, signIn = true) {
    await page.setViewportSize(DESKTOP);
    if (signIn) await signInOwner(page);
    await page.goto('/admin/team');
    await page
      .locator('.exq-teamcard', { hasText: name })
      .getByRole('link', { name })
      .first()
      .click();
    await page.getByRole('tab', { name: 'Prices' }).click();
    await expect(page.getByRole('heading', { name: 'Prices', level: 2 })).toBeVisible();
  }

  test("sets Drew's own haircut price and time, shows it on his page, and goes back to the shop price", async ({
    page,
  }) => {
    await openPrices(page, 'Drew');
    const save = page.getByRole('button', { name: 'Save prices' });
    // Nothing changed yet: the existing kids entry is filled in and Save is off.
    await expect(page.getByLabel('Price in dollars for Kids Cut', { exact: true })).toHaveValue(
      '25.00',
    );
    await expect(page.getByLabel('Price in dollars for Haircut', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Price in dollars for Haircut', { exact: true })).toHaveAttribute(
      'placeholder',
      '40.00',
    );
    await expect(save).toBeDisabled();

    // A field in error turns Save off and says why.
    await page.getByLabel('Price in dollars for Haircut', { exact: true }).fill('42.50');
    await page.getByLabel('Minutes for Haircut', { exact: true }).fill('47');
    await expect(page.getByText('Whole minutes in steps of 5, from 5 to 480')).toBeVisible();
    await expect(save).toBeDisabled();
    await page.getByLabel('Price in dollars for Haircut', { exact: true }).fill('forty');
    await expect(page.getByText('Enter dollars, for example 45 or 45.50')).toBeVisible();

    await page.getByLabel('Price in dollars for Haircut', { exact: true }).fill('42.50');
    await page.getByLabel('Minutes for Haircut', { exact: true }).fill('50');
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText(/Prices saved\./)).toBeVisible();
    await expect(save).toBeDisabled();

    await page.goto('/chairs/drew');
    await expect(rowLink(page, 'Book Haircut with Drew, 50 minutes, $42.50')).toBeVisible();
    // The shop price on /services is the lowest among the barbers who do it, which is still Lee's $40.
    await page.goto('/services');
    await expect(rowLink(page, 'Book Haircut, 45 minutes, From $40')).toBeVisible();

    // Back to the shop's own price and time.
    await openPrices(page, 'Drew', false);
    await page
      .getByRole('button', { name: 'Use the shop price and time for Haircut', exact: true })
      .click();
    await expect(page.getByLabel('Price in dollars for Haircut', { exact: true })).toHaveValue('');
    await save.click();
    await expect(page.getByText(/Prices saved\./).first()).toBeVisible();
    await page.goto('/chairs/drew');
    await expect(rowLink(page, 'Book Haircut with Drew, 45 minutes, $40')).toBeVisible();
  });

  test('a barber with no services has nothing to price and points to the Services tab', async ({
    page,
  }) => {
    await openPrices(page, 'Iniya');
    await expect(page.getByText(/has no services yet, so there is nothing to price/)).toBeVisible();
    await page.getByRole('button', { name: 'Choose services' }).click();
    await expect(page.getByRole('tab', { name: 'Services' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds nothing on the Prices tab, ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('exq-theme', t);
      }, theme);
      await openPrices(page, 'Dontrise');
      for (const size of [DESKTOP, PHONE]) {
        await page.setViewportSize(size);
        await page.waitForTimeout(300);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(
          results.violations.map((v) => `${size.width} ${v.id}: ${v.nodes[0]?.html ?? ''}`),
        ).toEqual([]);
      }
    });
  }
});
