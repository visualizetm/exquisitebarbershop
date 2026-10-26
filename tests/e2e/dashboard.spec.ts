import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { bookPublicly, signInOwner } from './owner';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

test.describe('the owner dashboard shell', () => {
  test('shows the top bar, the Shop | Website switch and the section tabs at 1280, no side menu', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await expect(page).toHaveURL(/\/admin\/shop\/today$/);
    await expect(page.locator('.exq-sidebar')).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Shop sections' });
    for (const label of ['Today', 'Bookings', 'Schedule', 'Clients', 'Team']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    // Logo, switch, search, the clock, New booking and the account menu sit in the top bar.
    const top = page.locator('.exq-topbar');
    await expect(top.locator('.exq-mark--dark').first()).toHaveAttribute(
      'src',
      '/brand/exq-stacked-white.svg',
    );
    await expect(
      top.getByRole('combobox', { name: 'Search bookings and customers' }),
    ).toBeVisible();
    await expect(top.locator('.exq-topbar__date')).toHaveText(
      /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} · \d{1,2}:\d{2} (AM|PM)$/,
    );
    await expect(top.getByRole('button', { name: 'New booking' })).toBeVisible();
    // The account menu holds Settings, Audit, Outbox, Change password and Sign out.
    await top.getByRole('button', { name: /^Account menu/ }).click();
    for (const label of ['Settings', 'Audit log', 'Outbox', 'Change password']) {
      await expect(page.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: 'Audit log' })).toBeHidden();
    // The switch moves to the Website side and is remembered on this device.
    const sw = top.getByRole('group', { name: 'Dashboard side' });
    await expect(sw.getByRole('button', { name: 'Shop' })).toHaveAttribute('aria-pressed', 'true');
    await sw.getByRole('button', { name: 'Website' }).click();
    await expect(page).toHaveURL(/\/admin\/website\/announcement$/);
    const web = page.getByRole('navigation', { name: 'Website sections' });
    for (const label of [
      'Announcement',
      'Top of page',
      'Hours',
      'Services and prices',
      'Gallery',
      'Reviews',
    ]) {
      await expect(web.getByRole('link', { name: label })).toBeVisible();
    }
    expect(await page.evaluate(() => localStorage.getItem('exq-admin-side'))).toBe('website');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/website\/announcement$/);
    await sw.getByRole('button', { name: 'Shop' }).click();
    await expect(page).toHaveURL(/\/admin\/shop\/today$/);
    // Every old address lands on its new home.
    for (const [from, to] of [
      ['/admin/bookings?range=past', /\/admin\/shop\/bookings\?range=past$/],
      ['/admin/customers', /\/admin\/shop\/clients$/],
      ['/admin/team', /\/admin\/shop\/team$/],
      ['/admin/schedule?view=week', /\/admin\/shop\/schedule\?view=week$/],
      ['/admin/website?tab=photo', /\/admin\/website\/top$/],
      ['/admin/photos', /\/admin\/website\/gallery$/],
    ] as const) {
      await page.goto(from);
      await expect(page, from).toHaveURL(to);
    }
  });

  test('at 390 the switch and the tabs share one row that scrolls sideways, and nothing overflows', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await signInOwner(page);
    await expect(page.locator('.exq-sidebar')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Dashboard, mobile' })).toHaveCount(0);
    const row = page.locator('.exq-sectabs');
    await expect(row.getByRole('group', { name: 'Dashboard side' })).toBeVisible();
    await expect(row.getByRole('link', { name: 'Today' })).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    await row.getByRole('link', { name: 'Team' }).click();
    await expect(page).toHaveURL(/\/admin\/shop\/team$/);
    // Tap targets are at least 44px tall.
    for (const locator of [
      row.getByRole('button', { name: 'Website' }),
      row.getByRole('link', { name: 'Team' }),
      page.getByRole('button', { name: 'New booking' }),
      page.getByRole('button', { name: /^Account menu/ }),
    ]) {
      const box = await locator.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
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

  test('axe finds nothing in the shell, with the account menu open', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.getByRole('button', { name: /^Account menu/ }).click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
  });

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
        await page.waitForSelector('.exq-floorcard[data-kind]:not([data-kind="loading"])');
        await page.waitForTimeout(500);
        const check = async (label: string) => {
          const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
          expect(
            results.violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.html ?? ''}`),
            label,
          ).toEqual([]);
        };
        await check(`overview ${size.width}`);
        await page.goto('/admin/shop/bookings?range=upcoming');
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

  test('Today shows real numbers, the quick actions and the chart with a text table', async ({
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
    for (const label of ['Booked', 'Done', 'Walk-ins', 'Takings']) {
      await expect(page.locator('.exq-sofar__tile', { hasText: label })).toBeVisible();
    }
    // Search, quick actions, the first chair card and Today so far all sit in the first screen.
    for (const locator of [
      page.getByRole('combobox', { name: 'Search bookings and customers' }),
      quick,
      page.locator('.exq-floorcard').first(),
      page.getByRole('heading', { name: 'Today so far' }),
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
    const walkIns = page.locator('.exq-sofar__tile', { hasText: 'Walk-ins' }).locator('dd');
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
    // Recent activity lists the walk-in and opens the booking.
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
    await page.goto('/admin/shop/bookings');
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
    await page.goto('/admin/shop/bookings');
    await page
      .getByRole('button', { name: /Open booking for Deep Link/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/admin\/shop\/bookings\/[0-9a-f]{24}$/);
    const sheet = page.getByRole('dialog', { name: 'Booking' });
    const code = (await sheet.locator('.exq-bsheet__code').textContent()) ?? '';
    expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{4}$/);
    // Reloading the deep link opens the same panel over the list.
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Booking' }).getByText(code)).toBeVisible();
    await expect(page.locator('table.exq-table')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/admin\/shop\/bookings$/);
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
