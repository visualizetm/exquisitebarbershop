import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_BARBER_PIN } from '../../scripts/e2e-accounts';
import { resetRateLimits, signInOwner } from './owner';

/*
 * The real shop facts (address, phone, hours, Directions) and the one person who takes bookings
 * somewhere else. Runs against the e2e server, which is seeded from seed/shop.ts.
 */

const MAPS =
  'https://www.google.com/maps/search/?api=1&query=Exquisite%20Barber%20%26%20Beauty%20Lounge&query_place_id=ChIJISdW6zTpxokRzSBEJjMQU4M';
const INSTAGRAM = 'https://instagram.com/iniyathestylist';
const PERSONAL_NUMBER = /560.?9806/;

test.describe('visit page', () => {
  test('hours with today marked, Suite F, Directions, Call and the access facts', async ({
    page,
  }) => {
    await page.goto('/visit');
    await expect(page.getByRole('heading', { name: 'Find us', level: 1 })).toBeVisible();

    // The week: Monday closed, Tuesday to Sunday 10 AM to 7 PM, and exactly one row is today.
    const rows = page.locator('.exq-hours__row');
    await expect(rows).toHaveCount(7);
    await expect(rows.filter({ hasText: 'Monday' })).toContainText('Closed');
    for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      await expect(rows.filter({ hasText: day }), day).toContainText('10 AM to 7 PM');
    }
    const today = page.locator('.exq-hours__row[data-today="true"]');
    await expect(today).toHaveCount(1);
    await expect(today.locator('.exq-hours__today')).toHaveText('Today');

    // The address carries the suite.
    await expect(page.locator('.exq-visit__address-text')).toContainText(
      '3309 Edgmont Ave, Suite F',
    );
    await expect(page.locator('.exq-visit__address-text')).toContainText('Brookhaven, PA 19015');

    // Directions is the shop's own Google Maps page, in a new tab.
    const directions = page.getByRole('link', { name: 'Directions' });
    await expect(directions).toHaveAttribute('href', MAPS);
    await expect(directions).toHaveAttribute('target', '_blank');
    await expect(directions).toHaveAttribute('rel', /noopener/);

    // Call, and the number as text.
    await expect(page.getByRole('link', { name: 'Call', exact: true })).toHaveAttribute(
      'href',
      /^tel:\+?1?6106090786$/,
    );
    await expect(
      page.getByLabel('Contact').getByRole('link', { name: '(610) 609-0786' }),
    ).toBeVisible();

    // Facts from the Google profile, and the policy and parking copy that is still a placeholder.
    await expect(page.getByText('Wheelchair accessible parking lot')).toBeVisible();
    await expect(page.getByText('Kids welcome')).toBeVisible();
    await expect(page.getByText('Parking details coming soon.')).toBeVisible();

    // The stand-in email and the owner's personal number are nowhere on the page.
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    expect(await page.content()).not.toMatch(PERSONAL_NUMBER);
    expect(await page.content()).not.toContain('hello@exquisitebarberbeauty.com');
  });

  test('every Directions button, on Home and on Visit, opens the Maps page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Directions' })).toHaveAttribute('href', MAPS);
    await page.goto('/visit');
    await expect(page.getByRole('link', { name: 'Directions' })).toHaveAttribute('href', MAPS);
  });

  test('the footer and the no-script text carry the suite and the real number', async ({
    page,
  }) => {
    await page.goto('/');
    const footer = page.locator('footer.exq-footer');
    await expect(footer).toContainText('3309 Edgmont Ave, Suite F');
    await expect(footer.getByRole('link', { name: '(610) 609-0786' })).toBeVisible();
    const html = await (await page.request.get('/')).text();
    expect(html).toContain('3309 Edgmont Ave, Suite F, Brookhaven, PA');
    expect(html).toContain('(610) 609-0786');
    expect(html).not.toContain('555-0100');
    expect(html).not.toMatch(PERSONAL_NUMBER);
  });

  test('the JSON-LD has the phone, the suite, the hours and the Instagram page, and no rating', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    const data = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    ) as {
      '@type': string;
      telephone: string;
      email?: string;
      address: { streetAddress: string; postalCode: string };
      sameAs: string[];
      openingHoursSpecification: { dayOfWeek: string; opens: string; closes: string }[];
    };
    expect(data['@type']).toBe('BarberShop');
    expect(data.telephone).toBe('+16106090786');
    expect(data.address.streetAddress).toBe('3309 Edgmont Ave, Suite F');
    expect(data.address.postalCode).toBe('19015');
    expect(data.sameAs).toEqual(['https://instagram.com/exquisitebarberbeauty']);
    expect(data.email).toBeUndefined();
    expect(data.openingHoursSpecification.map((d) => d.dayOfWeek)).toEqual([
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    for (const spec of data.openingHoursSpecification) {
      expect([spec.opens, spec.closes]).toEqual(['10:00', '19:00']);
    }
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|ratingValue/);
  });

  test('the announcement strip says Walk-ins welcome and links to booking', async ({ page }) => {
    await page.goto('/');
    const strip = page.locator('.exq-topstrip');
    await expect(strip).toContainText('Walk-ins welcome');
    await expect(strip.getByRole('link', { name: 'Book online' })).toHaveAttribute('href', '/book');
  });
});

test.describe('Iniya takes bookings on Instagram', () => {
  test('her card on the home strip goes to her Instagram, never to booking', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.exq-home__chairs li[data-state="instagram"]');
    await expect(card).toHaveCount(1);
    const link = card.getByRole('link');
    await expect(link).toHaveAttribute('href', INSTAGRAM);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toContainText('Iniya');
    await expect(link).toContainText('Braids and wigs');
    await expect(link).toContainText('Book through Instagram');
    // Not "Off today": she has no hours here, and that is not what her card should say.
    await expect(card).not.toContainText(/Off today|Closed today|Next open/);
    // The other four chairs are bookable and none links to her booking page.
    await expect(page.locator('.exq-home__chairs li[data-state="bookable"]')).toHaveCount(4);
    await expect(page.locator('a[href="/book?barber=iniya"]')).toHaveCount(0);
  });

  test('the chairs page links her card to her own page', async ({ page }) => {
    await page.goto('/chairs');
    const card = page.locator('li[data-state="instagram"]');
    await expect(card.getByRole('link')).toHaveAttribute('href', '/chairs/iniya');
    await expect(card).toContainText('Book through Instagram');
  });

  test('her page has a Book through Instagram button and no Book button or openings', async ({
    page,
  }) => {
    await page.goto('/chairs/iniya');
    await expect(page.getByRole('heading', { name: 'Iniya', exact: true })).toBeVisible();
    await expect(page.locator('.exq-chair__title')).toHaveText('Braider');
    await expect(page.locator('.exq-chair__bio')).toHaveText(
      'Braiding since 2020. Book through Instagram for now.',
    );
    const button = page.locator('.exq-chair__actions').getByRole('link', {
      name: 'Book through Instagram',
    });
    await expect(button).toHaveAttribute('href', INSTAGRAM);
    await expect(button).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: /^Book Iniya/ })).toHaveCount(0);
    await expect(page.locator('a[href^="/book?barber=iniya"]')).toHaveCount(0);
    await expect(page.locator('.exq-chair__openings')).toHaveCount(0);
    await expect(page.getByText('Walk-ins only')).toHaveCount(0);
    // No portrait yet: the frame shows its no-photo state on purpose, with her name.
    const photo = page.locator('.exq-chair__photo .exq-photoframe');
    await expect(photo).toHaveAttribute('data-state', 'placeholder');
    // The panel's small Q mark is the only image: no portrait.
    await expect(page.locator('.exq-chair__photo img.exq-photoframe__img')).toHaveCount(0);
  });

  test('/book?barber=iniya falls back to anyone available', async ({ page }) => {
    await page.goto('/book?barber=iniya');
    await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeVisible();
    await expect(page).toHaveURL(/barber=any/);
    await expect(page).not.toHaveURL(/iniya/);
  });

  test('she is not in the booking picker, and first available never lands on her', async ({
    page,
  }) => {
    await page.goto('/book');
    await page.getByLabel(/^Haircut(?! and| with)/).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    const picker = page.locator('.exq-staff-picker');
    await expect(picker).toBeVisible();
    await expect(picker.getByText('Anyone available')).toBeVisible();
    for (const name of ['Dontrise', 'Lee', 'Drew', 'Nelly Cutz']) {
      await expect(
        picker.locator('.exq-option__title', { hasText: name }).first(),
        name,
      ).toBeVisible();
    }
    await expect(picker.getByText('Iniya')).toHaveCount(0);
  });

  test('the sitemap skips her, like the staff picker', async ({ page }) => {
    const sitemap = await (await page.request.get('/sitemap.xml')).text();
    expect(sitemap).not.toContain('/chairs/iniya</loc>');
    expect(sitemap).toContain('/chairs/drew</loc>');
  });
});

/*
 * Nelly does three services, Lee five, Dontrise nine, Iniya none. A chair that is already chosen
 * must only offer its own menu, or a click on someone else's service ends on an empty calendar.
 */
const NELLY_MENU = ['Haircut', 'Kids Cut', 'Steam, Hot Towel and Fade'];

test.describe('a chair only lists the services it does', () => {
  test('/book?barber=nelly (a printed card) lists her three, and each one leads to open days', async ({
    page,
  }) => {
    await page.goto('/book?barber=nelly');
    await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeVisible();
    const picker = page.locator('.exq-service-picker');
    await expect(picker.locator('.exq-service-option')).toHaveCount(NELLY_MENU.length);
    for (const name of NELLY_MENU) {
      await expect(picker.locator('.exq-service-option', { hasText: name }), name).toHaveCount(1);
    }
    await expect(picker.getByText('Eyebrows')).toHaveCount(0);
    await expect(picker.getByText('Showing what Nelly Cutz offers.')).toBeVisible();

    await picker.getByLabel(/^Steam, Hot Towel and Fade/).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Pick a day' })).toBeVisible();
    await expect(page.locator('.exq-day-option[data-state="available"]').first()).toBeVisible();
    await expect(page.getByText(/Nothing is open in the next/)).toHaveCount(0);
  });

  test('See every service lists all fifteen, and the chosen services stay chosen', async ({
    page,
  }) => {
    await page.goto('/book?barber=nelly');
    const picker = page.locator('.exq-service-picker');
    await picker.getByLabel(/^Kids Cut(?! with)/).click();
    await picker.getByRole('button', { name: 'See every service' }).click();
    await expect(picker.locator('.exq-service-option')).toHaveCount(15);
    await expect(picker.getByText('Eyebrows')).toBeVisible();
    await expect(picker.getByRole('button', { name: 'See every service' })).toHaveCount(0);
    await expect(picker.getByLabel(/^Kids Cut(?! with)/)).toBeChecked();
  });

  test('with no chair chosen, or anyone available, every service is listed', async ({ page }) => {
    for (const path of ['/book', '/book?barber=any']) {
      await page.goto(path);
      await expect(page.locator('.exq-service-picker .exq-service-option'), path).toHaveCount(15);
      await expect(page.getByText(/Showing what .* offers\./)).toHaveCount(0);
    }
  });

  test('the owner New booking panel narrows to the chosen barber, and says so for a barber with none', async ({
    page,
  }) => {
    await signInOwner(page);
    await page.getByRole('button', { name: 'Walk-in', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'New booking' });
    const services = panel.locator('fieldset', { hasText: 'Services' });

    await panel.getByLabel('Barber').selectOption({ label: 'Nelly Cutz' });
    await expect(services.getByRole('checkbox')).toHaveCount(NELLY_MENU.length);
    for (const name of NELLY_MENU) {
      // The label is the name, then the length and price as a hint.
      await expect(services.getByLabel(new RegExp(`^${name}`)), name).toBeVisible();
    }
    await expect(services.getByLabel('Eyebrows')).toHaveCount(0);

    // A phone booking can go to first available, which shows the whole menu.
    await panel.getByRole('button', { name: 'Phone booking' }).click();
    await panel.getByLabel('Barber').selectOption({ label: 'First available' });
    await expect(services.getByRole('checkbox')).toHaveCount(15);

    // A barber with no menu: a plain sentence, no boxes, and nothing to submit.
    await panel.getByLabel('Barber').selectOption({ label: 'Iniya' });
    await expect(services.getByRole('checkbox')).toHaveCount(0);
    await expect(
      panel.getByText('Iniya has no services yet. Add some under Team, Services.'),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Book it' })).toBeDisabled();
  });

  async function openPortalWalkIn(page: Page, name: string) {
    await resetRateLimits();
    await page.goto('/team');
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    const pad = page.getByRole('group', { name: /^PIN for/ });
    for (const digit of E2E_BARBER_PIN)
      await pad.getByRole('button', { name: digit, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Walk-in', exact: true }).click();
    return page.getByRole('dialog', { name: 'Walk-in' });
  }

  test("a barber's walk-in form lists only that barber's own services", async ({ page }) => {
    const sheet = await openPortalWalkIn(page, 'Nelly');
    const boxes = sheet.locator('fieldset', { hasText: 'Services' }).getByRole('checkbox');
    await expect(boxes).toHaveCount(NELLY_MENU.length);
    for (const name of NELLY_MENU) {
      await expect(sheet.getByLabel(new RegExp(`^${name},`)), name).toBeVisible();
    }
    await expect(sheet.getByLabel(/^Eyebrows/)).toHaveCount(0);
  });

  test('a barber with no menu is told so instead of seeing an empty box', async ({ page }) => {
    const sheet = await openPortalWalkIn(page, 'Iniya');
    await expect(
      sheet.getByText('You have no services set up yet. Ask the owner to add them.'),
    ).toBeVisible();
    await expect(sheet.getByRole('checkbox')).toHaveCount(0);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe finds nothing on Iniya's page, her card and the visit page, ${theme}`, async ({
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
      for (const path of ['/chairs/iniya', '/chairs', '/visit', '/']) {
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
