import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { bookPublicly, signInOwner } from './owner';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

test.describe('the owner dashboard shell', () => {
  test('shows the sidebar, the top bar and every area at 1280', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    const nav = page.getByRole('navigation', { name: 'Dashboard', exact: true });
    for (const label of [
      'Overview',
      'Bookings',
      'Schedule',
      'Customers',
      'Team',
      'Website',
      'Settings',
    ]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    const side = page.locator('.exq-sidebar');
    const box = await side.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(248);
    await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Search, today's date and the primary button sit in the top bar.
    const top = page.locator('.exq-topbar');
    await expect(
      top.getByRole('combobox', { name: 'Search bookings and customers' }),
    ).toBeVisible();
    await expect(top.getByRole('button', { name: 'New booking' })).toBeVisible();
    // The tab bar is for phones only.
    await expect(page.getByRole('navigation', { name: 'Dashboard, mobile' })).toBeHidden();
  });

  test('shows the top bar, the menu button and a four tab bar at 390', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInOwner(page);
    await expect(page.locator('.exq-sidebar')).toBeHidden();
    const tabs = page.getByRole('navigation', { name: 'Dashboard, mobile' });
    await expect(tabs.getByRole('link')).toHaveCount(3);
    await tabs.getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet.getByRole('link', { name: 'Customers' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Website' })).toBeVisible();
    await sheet.getByRole('link', { name: 'Customers' }).click();
    await expect(page).toHaveURL(/\/admin\/customers$/);
  });

  test('"/" focuses the search, which finds a booking by code, phone and name, from the keyboard', async ({
    page,
    context,
  }) => {
    const { code, phone } = await bookPublicly(page, 'drew', { name: 'Zoë Searchable' });
    await context.clearCookies();
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.locator('body').click({ position: { x: 700, y: 400 } });
    await page.keyboard.press('/');
    const box = page.getByRole('combobox', { name: 'Search bookings and customers' });
    await expect(box).toBeFocused();

    // By code: exact.
    await box.fill(code);
    const list = page.getByRole('listbox');
    await expect(list.getByRole('option', { name: /Zoë Searchable/ }).first()).toBeVisible();
    // By the last four digits of the phone, in a different format.
    await box.fill(phone.slice(-4));
    await expect(list.getByRole('group', { name: 'Customers' })).toBeVisible();
    // By the start of the name without the accent, in capitals.
    await box.fill('ZOE SEARCH');
    await expect(list.getByRole('group', { name: 'Bookings' })).toBeVisible();
    // Down, Enter opens the booking.
    await expect(list.getByRole('option').first()).toBeVisible();
    await box.press('ArrowDown');
    await box.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Booking' }).getByText(code)).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds nothing in the shell, ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('exq-theme', t);
      }, theme);
      await page.setViewportSize(DESKTOP);
      await signInOwner(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds nothing on Overview, Bookings and the booking panel, ${theme}`, async ({
      page,
      context,
    }) => {
      const { code } = await bookPublicly(page, 'nelly', { name: 'Axe Customer' });
      await context.clearCookies();
      await page.addInitScript((t) => {
        localStorage.setItem('exq-theme', t);
      }, theme);
      await signInOwner(page);
      for (const size of [DESKTOP, PHONE]) {
        await page.setViewportSize(size);
        await page.goto('/admin');
        await page.waitForSelector('.exq-chairrow');
        await page.waitForTimeout(500);
        const check = async (label: string) => {
          const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
          expect(
            results.violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.html ?? ''}`),
            label,
          ).toEqual([]);
        };
        await check(`overview ${size.width}`);
        await page.goto('/admin/bookings?range=upcoming');
        await expect(
          page.locator('.exq-table__row[data-state="interactive"]').first(),
        ).toBeVisible();
        await check(`bookings ${size.width}`);
        await page.getByRole('combobox', { name: 'Search bookings and customers' }).fill(code);
        await page.getByRole('listbox').getByRole('option').first().click();
        const sheet = page.getByRole('dialog', { name: 'Booking' });
        await expect(sheet.getByText(code)).toBeVisible();
        await page.waitForTimeout(500);
        await check(`booking panel ${size.width}`);
      }
    });
  }

  test('the overview shows real numbers, the quick actions and the chart with a text table', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    const quick = page.getByRole('group', { name: 'Quick actions' });
    for (const name of [
      'New booking',
      'Walk-in',
      'Block time',
      'Barber out today',
      'Edit announcement',
    ]) {
      await expect(quick.getByRole('button', { name })).toBeVisible();
    }
    for (const label of [
      'Bookings today',
      'Booked value today',
      'Walk-ins today',
      'No-shows this week',
    ]) {
      await expect(page.locator('.exq-stat', { hasText: label })).toBeVisible();
    }
    // Sidebar, search, quick actions, tiles, Now and next and the chart all sit in the first screen.
    for (const locator of [
      page.locator('.exq-sidebar'),
      page.getByRole('combobox', { name: 'Search bookings and customers' }),
      quick,
      page.locator('.exq-stat').first(),
      page.getByRole('heading', { name: 'Now and next' }),
      page.getByRole('img', { name: /Bookings this week/ }),
    ]) {
      const box = await locator.boundingBox();
      expect(box, 'in view').not.toBeNull();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(800);
    }
    // The chart has a real table for screen readers.
    const table = page.locator('.exq-chart table');
    await expect(table.getByRole('row')).toHaveCount(8);
    await expect(table.getByRole('columnheader', { name: 'Last week' })).toHaveCount(1);
  });

  test('Walk-in adds a booking that shows in the tiles and the activity list', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    const walkIns = page
      .locator('.exq-stat', { hasText: 'Walk-ins today' })
      .locator('.exq-stat__value');
    const before = Number((await walkIns.textContent()) ?? '0');
    await page.getByRole('button', { name: 'Walk-in' }).click();
    const panel = page.getByRole('dialog', { name: 'New booking' });
    await panel.getByLabel(/^Haircut(?! and| with)/).check();
    // Any chair: an earlier run on the same server may already have one in the chair now.
    const chair =
      ['Dontrise', 'Lee', 'Drew', 'Nelly Cutz'][Math.floor(Math.random() * 4)] ?? 'Dontrise';
    await panel.getByLabel('Barber').selectOption({ label: chair });
    await panel.getByLabel('Client name').fill('Walk In Visitor');
    await panel
      .getByLabel('Phone')
      .fill(`215555${String(Math.floor(Math.random() * 9000) + 1000)}`);
    await panel.getByRole('button', { name: 'Add walk-in' }).click();
    await expect(
      page.getByText(new RegExp(`Walk In Visitor is booked with ${chair}`)),
    ).toBeVisible();
    await expect(walkIns).toHaveText(String(before + 1));
    await expect(page.locator('.exq-activity__item', { hasText: 'Walk In Visitor' })).toContainText(
      'Walk-in',
    );
    // Now and next shows who is in that chair, and opens the booking.
    await page
      .locator('.exq-activity__item', { hasText: 'Walk In Visitor' })
      .getByRole('button')
      .click();
    const sheet = page.getByRole('dialog', { name: 'Booking' });
    await expect(sheet.getByText('Walk In Visitor').first()).toBeVisible();
    // Cancelled again, so the chair is free for the barber portal and team tests that follow.
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
    await sheet.getByRole('button', { name: 'Cancel booking' }).click();
    await expect(sheet.locator('.exq-status-chip[data-status="cancelled"]')).toBeVisible();
  });
});

test.describe('the bookings page', () => {
  test('filters, sorts and pages through the address, and a row opens the same panel', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/bookings');
    // Quick filters carry counts.
    for (const name of ['Today', 'Tomorrow', 'This week', 'Upcoming', 'Past']) {
      await expect(
        page.getByRole('button', { name: new RegExp(`^${name}\\s*\\d+$`) }),
      ).toBeVisible();
    }
    await page.getByRole('button', { name: /^Past/ }).click();
    await expect(page).toHaveURL(/range=past/);
    await page.getByRole('combobox', { name: 'Status' }).selectOption('cancelled');
    await expect(page).toHaveURL(/status=cancelled/);
    // Sorting is a header button that reports aria-sort.
    const header = page.getByRole('columnheader', { name: 'Client' });
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    // A real table.
    await expect(page.locator('table.exq-table')).toHaveCount(1);
  });

  test('/admin/bookings/:id opens the panel over the list, and closing returns to the list', async ({
    page,
    context,
  }) => {
    await bookPublicly(page, 'nelly', { name: 'Deep Link' });
    await context.clearCookies();
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/bookings');
    await page
      .getByRole('button', { name: /Open booking for Deep Link/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/bookings\/[0-9a-f]{24}$/);
    const sheet = page.getByRole('dialog', { name: 'Booking' });
    const code = (await sheet.locator('.exq-bsheet__code').textContent()) ?? '';
    expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{4}$/);
    // Reloading the deep link opens the same panel over the list.
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Booking' }).getByText(code)).toBeVisible();
    await expect(page.locator('table.exq-table')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/admin\/bookings$/);
  });

  test('the panel cancels with and without a notice, and Resend says why it is off', async ({
    page,
    context,
  }) => {
    const { code } = await bookPublicly(page, 'drew', { name: 'Cancel Me' });
    await context.clearCookies();
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.getByRole('combobox', { name: 'Search bookings and customers' }).fill(code);
    await page.getByRole('listbox').getByRole('option').first().click();
    const sheet = page.getByRole('dialog', { name: 'Booking' });
    // Email is off on the e2e server: the button is disabled with its reason, and does nothing.
    const resend = sheet.getByRole('button', { name: 'Resend confirmation' });
    await expect(resend).toHaveAttribute('aria-disabled', 'true');
    await expect(
      sheet.getByText('Email is off on this site, so nothing can be sent.').first(),
    ).toBeVisible();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await sheet.getByRole('button', { name: 'Copy manage link' }).click();
    await expect(page.getByText('Manage link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/manage\?token=/);
    // Cancel: the choices are Cancel and Cancel and notify (the latter needs an email).
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Cancel and notify' }).first()).toBeDisabled();
    await sheet.getByRole('button', { name: 'Cancel booking' }).click();
    await expect(sheet.locator('.exq-status-chip[data-status="cancelled"]')).toBeVisible();
  });
});

test.describe('the announcement quick action', () => {
  test('changes the public strip right away, limited to 90 characters, and switches off', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.getByRole('button', { name: 'Edit announcement' }).click();
    const panel = page.getByRole('dialog', { name: 'Announcement' });
    const text = panel.getByLabel('Text');
    await expect(text).toHaveAttribute('maxlength', '90');
    await text.fill('Closed Monday for the holiday');
    await panel.getByLabel('Link label (optional)').fill('See hours');
    await panel.getByLabel('Link address').fill('/visit');
    await panel.getByRole('button', { name: 'Save announcement' }).click();
    await expect(page.getByText(/Announcement saved/)).toBeVisible();

    const visitor = await (await browser.newContext()).newPage();
    try {
      await visitor.goto('/');
      await expect(visitor.locator('.exq-topstrip')).toContainText('Closed Monday for the holiday');
      await expect(visitor.getByRole('link', { name: 'See hours' }).first()).toHaveAttribute(
        'href',
        '/visit',
      );

      // A last day in the past switches it off by itself: gone from the site.
      await page.getByRole('button', { name: 'Edit announcement' }).click();
      await panel.getByLabel('Last day it shows (optional)').fill('2020-01-01');
      await panel.getByRole('button', { name: 'Save announcement' }).click();
      await expect(page.getByText(/Announcement saved/).last()).toBeVisible();
      await visitor.reload();
      await expect(visitor.locator('.exq-topstrip')).toHaveCount(0);
    } finally {
      // Put the original strip back, so the tests after this one see the same site.
      await page.getByRole('button', { name: 'Edit announcement' }).click();
      await panel.getByLabel('Text').fill('Walk-ins welcome');
      await panel.getByLabel('Link label (optional)').fill('Book online');
      await panel.getByLabel('Link address').fill('/book');
      await panel.getByLabel('Last day it shows (optional)').fill('');
      await panel.getByRole('button', { name: 'Save announcement' }).click();
      await expect(page.getByText(/Announcement saved/).last()).toBeVisible();
    }
    await visitor.context().close();
  });
});
