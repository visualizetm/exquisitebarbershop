import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DateTime } from 'luxon';
import { bookPublicly, signInOwner } from './owner';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const ZONE = 'America/New_York';

test.describe('schedule', () => {
  test('shows bookings as blocks, opens one, and an empty slot opens New booking filled in', async ({
    page,
    context,
  }) => {
    const { startAt } = await bookPublicly(page, 'lee', { name: 'Grid Customer' });
    await context.clearCookies();
    const local = DateTime.fromISO(startAt, { zone: ZONE });
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto(`/admin/schedule?date=${local.toISODate() ?? ''}`);
    const block = page.getByRole('button', { name: /^Grid C\. / }).first();
    await expect(block).toBeVisible();
    await block.click();
    await expect(
      page.getByRole('dialog', { name: 'Booking' }).getByText('Grid Customer'),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // The plus in a chair header opens New booking with that barber chosen.
    await page.getByRole('button', { name: 'New booking for Drew' }).click();
    const panel = page.getByRole('dialog', { name: 'New booking' });
    await expect(panel.getByLabel('Barber')).toHaveValue('drew');
    await expect(panel.getByLabel('Time', { exact: true })).not.toHaveValue('');
    // A click on an empty slot of a chair does the same with the clicked time.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'New booking' })).toHaveCount(0);
    // The fourth chair (Nelly Cutz), five hours down its column (mid afternoon, where earlier specs
    // in a full run have not booked her: they take the first free times of the day). Playwright
    // scrolls that point into view first; a hand worked mouse position missed the grid once the
    // page had scrolled.
    await page
      .locator('.exq-daygrid__col')
      .nth(3)
      .click({ position: { x: 20, y: 24 * 4 * 5 + 12 } });
    await expect(
      page.getByRole('dialog', { name: 'New booking' }).getByLabel('Barber'),
    ).toHaveValue('nelly');
  });

  test('draws a red line for now, and the week view counts and opens a day', async ({
    page,
    context,
  }) => {
    const { startAt } = await bookPublicly(page, 'lee', { name: 'Week Customer' });
    await context.clearCookies();
    const local = DateTime.fromISO(startAt, { zone: ZONE });
    // Pretend it is 11:30 on the booking's day, so the line sits inside the working hours.
    await page.clock.install({ time: local.set({ hour: 11, minute: 30 }).toJSDate() });
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto(`/admin/schedule?date=${local.toISODate() ?? ''}`);
    await expect(page.locator('.exq-daygrid__now')).toBeVisible();

    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page).toHaveURL(/view=week/);
    const table = page.locator('table.exq-weekgrid');
    const cell = table
      .getByRole('button', { name: new RegExp(`^Lee, .*: [1-9]\\d* booking`) })
      .first();
    await expect(cell).toBeVisible();
    await cell.click();
    await expect(page).toHaveURL(/view=day/);
    await expect(page.locator('.exq-daygrid')).toBeVisible();
  });
});

test.describe('customers', () => {
  test('lists, searches with accents, keeps a private note and opens a visit', async ({
    page,
    context,
  }) => {
    const { phone } = await bookPublicly(page, 'drew', { name: 'Zoë Customerson' });
    await context.clearCookies();
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/customers');
    await page.getByLabel('Search customers').fill('ZOE CUST');
    const row = page.getByRole('button', { name: /Open Zoë Customerson/ });
    await expect(row).toBeVisible();
    await page.getByLabel('Search customers').fill(phone.slice(-4));
    await expect(row.first()).toBeVisible();
    await row.first().click();
    const sheet = page.getByRole('dialog', { name: 'Customer' });
    await expect(sheet.getByText('Zoë Customerson').first()).toBeVisible();
    await sheet.getByLabel('Private notes').fill('Likes the quiet chair.');
    await sheet.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByText('Note saved.')).toBeVisible();
    // It is still there after a reload of the deep link, and the list marks nothing publicly.
    await page.reload();
    await expect(
      page.getByRole('dialog', { name: 'Customer' }).getByLabel('Private notes'),
    ).toHaveValue('Likes the quiet chair.');
    // A visit opens the booking panel on top.
    await page
      .getByRole('dialog', { name: 'Customer' })
      .getByRole('button', { name: /Haircut with Drew/ })
      .first()
      .click();
    await expect(page.getByRole('dialog', { name: 'Booking' })).toBeVisible();
  });
});

test.describe('team and the resolver', () => {
  test('Block time with a booked client asks, Move puts the booking with another barber', async ({
    page,
    context,
  }) => {
    const { code, startAt } = await bookPublicly(page, 'nelly', { name: 'Move Me' });
    await context.clearCookies();
    const local = DateTime.fromISO(startAt, { zone: ZONE });
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.getByRole('button', { name: 'Block time' }).click();
    const panel = page.getByRole('dialog', { name: 'Block time' });
    await panel.getByLabel('Barber').selectOption({ label: 'Nelly Cutz' });
    await panel.getByRole('button', { name: 'Time off', exact: true }).click();
    await panel.getByLabel('Day', { exact: true }).fill(local.toISODate() ?? '');
    await panel.getByLabel('From', { exact: true }).fill('06:00');
    await panel.getByLabel('To', { exact: true }).fill('22:00');
    await panel.getByRole('button', { name: 'Block this time' }).click();

    // Nothing is saved yet; every booked client needs one choice (earlier tests may have added more).
    await expect(panel.getByText(/^0 of \d+ decided$/)).toBeVisible();
    const apply = panel.getByRole('button', { name: 'Apply the change' });
    await expect(apply).toBeDisabled();
    const items = panel.locator('.exq-resolver__item');
    const count = await items.count();
    // This test's own booking can move: some other chair is free at its time.
    await expect(
      items.filter({ hasText: code }).getByRole('radio', { name: /^Move/ }),
    ).toBeEnabled();
    for (let i = 0; i < count; i += 1) {
      const move = items.nth(i).getByRole('radio', { name: /^Move/ });
      if (await move.isEnabled()) await move.check({ force: true });
      else await items.nth(i).getByRole('radio', { name: /^Keep/ }).check({ force: true });
    }
    await expect(panel.getByText(`${String(count)} of ${String(count)} decided`)).toBeVisible();
    // Only chairs that do the service and are free are offered, never Nelly himself.
    const options = await panel.getByLabel('Move to').first().locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(0);
    expect(options).not.toContain('Nelly Cutz');
    await apply.click();
    await expect(page.getByText(/Time blocked\. .*moved/)).toBeVisible();

    await page.getByRole('combobox', { name: 'Search bookings and customers' }).fill(code);
    await page.getByRole('listbox').getByRole('option').first().click();
    await expect(
      page.getByRole('dialog', { name: 'Booking' }).getByText(/Moved to another barber/),
    ).toBeVisible();
    await expect(
      page
        .getByRole('dialog', { name: 'Booking' })
        .locator('.exq-bsheet__fact', { hasText: 'Barber' }),
    ).not.toContainText('Nelly');
  });

  test('adds a barber, shows them on the site, then removes them and the address still works', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/team');
    await page.getByRole('button', { name: 'Add barber' }).click();
    const panel = page.getByRole('dialog', { name: 'Add barber' });
    const unique = `Tester ${String(Date.now()).slice(-5)}`;
    await panel.getByLabel('Name', { exact: true }).fill(unique);
    await panel.getByLabel('Known for').fill('Sharp fades');
    const slug = unique.toLowerCase().replace(/\s+/g, '-');
    await expect(panel.getByLabel('Web address name')).toHaveValue(slug);
    await panel.getByRole('button', { name: 'Add barber' }).click();
    await expect(page).toHaveURL(/\/admin\/team\/[0-9a-f]{24}/);
    await expect(page.getByRole('heading', { name: unique, level: 1 })).toBeVisible();

    // Tabs: profile, services, hours, time off. Show on site puts them on the public page.
    await page.getByRole('tab', { name: 'Services' }).click();
    await expect(page.getByLabel(/^Haircut(?! and| with)/)).toBeChecked();
    await page.getByRole('tab', { name: 'Profile' }).click();
    await page.getByLabel('Show on site').check();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText(/Profile saved/)).toBeVisible();
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/chairs/${slug}`);
    await expect(visitor.getByRole('heading', { name: unique, level: 1 })).toBeVisible();

    // Remove: confirm, then the old address sends people to booking with anyone available.
    await page.getByRole('button', { name: `Remove ${unique}` }).click();
    await page
      .getByRole('dialog', { name: `Remove ${unique}?` })
      .getByRole('button', { name: `Remove ${unique}` })
      .click();
    await expect(page).toHaveURL(/\/admin\/team$/);
    await visitor.goto(`/chairs/${slug}`);
    await expect(visitor).toHaveURL(/\/book\?barber=any/);
    await visitor.close();
  });

  test('the In or Off switch turns a barber off through the panel and back in with one tap', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/team');
    const card = page.locator('.exq-teamcard', { hasText: 'Dontrise' });
    const toggle = card.getByRole('switch');
    // The shop may be closed today (the switch is then disabled); only test when it is open.
    test.skip(await toggle.isDisabled(), 'the shop is closed today');
    await expect(toggle).toBeChecked();
    await toggle.click();
    const panel = page.getByRole('dialog', { name: 'Barber out' });
    await expect(panel.getByLabel('Barber')).toHaveValue(/[0-9a-f]{24}/);
    await panel.getByRole('button', { name: 'Mark out' }).click();
    // A booking an earlier test moved onto this chair today asks first (the shop is open on
    // Sundays now): keep each one, then apply.
    const outToast = page.getByText(/Dontrise is out today/);
    const decide = panel.getByText(/^0 of \d+ decided$/);
    await expect(outToast.or(decide)).toBeVisible();
    if (await decide.isVisible()) {
      const items = panel.locator('.exq-resolver__item');
      const count = await items.count();
      for (let i = 0; i < count; i += 1) {
        await items.nth(i).getByRole('radio', { name: /^Keep/ }).check({ force: true });
      }
      await panel.getByRole('button', { name: 'Apply the change' }).click();
    }
    await expect(outToast).toBeVisible();
    await expect(card.getByRole('switch')).not.toBeChecked();
    await card.getByRole('switch').click();
    await expect(page.getByText(/Dontrise is back in today/)).toBeVisible();
    await expect(card.getByRole('switch')).toBeChecked();
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe finds nothing on schedule, customers, team and the resolver, ${theme}`, async ({
    page,
    context,
  }) => {
    const { startAt } = await bookPublicly(page, 'drew', { name: 'Axe Drew' });
    await context.clearCookies();
    await page.addInitScript((t) => {
      localStorage.setItem('exq-theme', t);
    }, theme);
    const date = DateTime.fromISO(startAt, { zone: ZONE }).toISODate() ?? '';
    await signInOwner(page);
    for (const size of [DESKTOP, PHONE]) {
      await page.setViewportSize(size);
      const check = async (label: string) => {
        await page.waitForTimeout(400);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(
          results.violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.html ?? ''}`),
          label,
        ).toEqual([]);
      };
      await page.goto(`/admin/schedule?date=${date}`);
      await expect(page.locator('.exq-daygrid')).toBeVisible();
      await check(`schedule day ${size.width}`);
      await page.goto('/admin/schedule?view=week');
      await expect(page.locator('table.exq-weekgrid')).toBeVisible();
      await check(`schedule week ${size.width}`);
      await page.goto('/admin/customers');
      await expect(page.locator('.exq-table__row[data-state="interactive"]').first()).toBeVisible();
      await check(`customers ${size.width}`);
      await page.goto('/admin/team');
      await expect(page.locator('.exq-teamcard').first()).toBeVisible();
      await check(`team ${size.width}`);
      await page.locator('.exq-teamcard').first().getByRole('link').first().click();
      await expect(page.getByRole('tablist')).toBeVisible();
      for (const tab of ['Profile', 'Services', 'Prices', 'Working hours', 'Time off']) {
        await page.getByRole('tab', { name: tab }).click();
        await check(`team ${tab} ${size.width}`);
      }
    }
  });
}
