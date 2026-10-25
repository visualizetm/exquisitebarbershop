import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
    await expect(page.locator('.exq-chair__photo img')).toHaveCount(0);
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
      await expect(picker.getByText(name, { exact: true }), name).toBeVisible();
    }
    await expect(picker.getByText('Iniya')).toHaveCount(0);
  });

  test('her page is in the sitemap', async ({ page }) => {
    const sitemap = await (await page.request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('/chairs/iniya</loc>');
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
