import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_BARBER_PIN } from '../../scripts/e2e-accounts';
import { bookPublicly, randomPhone, resetRateLimits, signInOwner } from './owner';

const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function signInBarber(page: Page, name: string) {
  await resetRateLimits();
  await page.goto('/team');
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  const pad = page.getByRole('group', { name: /^PIN for/ });
  for (const d of E2E_BARBER_PIN) await pad.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

const fullScreen = (page: Page) => page.locator('.exq-dialog[data-variant="full"][open]');
const sideSheet = (page: Page) => page.locator('.exq-dialog[data-variant="sheet"][open]');

test.describe('the full-screen booking flow', () => {
  test('the owner books a later time at 1440: service, barber with prices, NOW first, client search, confirm, ticket', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await signInOwner(page);
    await page.locator('.exq-topbar').getByRole('button', { name: 'New booking' }).click();
    const flow = page.getByRole('dialog', { name: 'New booking' });
    await expect(fullScreen(page)).toHaveCount(1);
    await expect(sideSheet(page)).toHaveCount(0);
    await flow.getByRole('button', { name: /^Haircut\b(?! and| with)/ }).click();
    await expect(flow.locator('.exq-flow__rail')).toContainText('$');
    await flow.getByRole('button', { name: 'Continue' }).click();
    // Every barber with a price and a wait; first available too.
    await expect(flow.getByRole('button', { name: /^First available/ })).toBeVisible();
    const drew = flow.getByRole('button', { name: /^Drew/ });
    await expect(drew).toContainText('$');
    await expect(drew).toContainText(/Free now|Free about|Off today/);
    await drew.click();
    await flow.getByRole('button', { name: 'Continue' }).click();
    // NOW is first on the time step, above the days.
    const now = flow.getByRole('button', { name: /^Now/ });
    await expect(now).toBeVisible();
    const nowBox = await now.boundingBox();
    const dayBox = await page.locator('.exq-day-picker').boundingBox();
    expect((nowBox?.y ?? 0) + (nowBox?.height ?? 0)).toBeLessThanOrEqual(dayBox?.y ?? 0);
    await page.locator('.exq-day-option[data-state="available"] button').first().click();
    await page.locator('.exq-time-option button').first().click();
    await flow.getByRole('button', { name: 'Continue' }).click();
    // Client search finds an existing client by name.
    await flow.getByLabel('Find a client').fill('Grid');
    await flow.getByLabel('Name', { exact: true }).fill('Flow Later Client');
    await flow.getByLabel('Mobile phone').fill(randomPhone());
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
    await flow.getByRole('button', { name: 'Continue' }).click();
    await expect(flow.getByText('Flow Later Client')).toBeVisible();
    await flow.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(flow.getByText(/^Booked: .* with Drew/)).toBeVisible();
    await flow.getByRole('button', { name: 'New booking' }).click();
    await expect(flow.getByText('Pick the services')).toBeVisible();
    await flow.getByRole('button', { name: 'Close' }).first().click();
    await expect(flow).toBeHidden();
  });

  test('a barber books NOW at 390 and lands in their own chair, with the bottom bar and no barber step', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await signInBarber(page, 'Drew');
    await page.getByRole('button', { name: 'Walk-in' }).click();
    const flow = page.getByRole('dialog', { name: 'New booking' });
    await expect(fullScreen(page)).toHaveCount(1);
    await expect(flow.getByRole('button', { name: /^Step \d: Barber/ })).toHaveCount(0);
    await flow.getByRole('button', { name: /^Lineup/ }).click();
    const bar = flow.locator('.exq-flow__rail');
    await expect(bar).toContainText('$');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    await flow.getByRole('button', { name: 'Continue' }).click();
    await expect(flow.getByRole('button', { name: /^Now/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await flow.getByRole('button', { name: 'Continue' }).click();
    await flow.getByLabel('Name', { exact: true }).fill('Now Phone Client');
    await flow.getByLabel('Mobile phone').fill(randomPhone());
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
    await flow.getByRole('button', { name: 'Continue' }).click();
    await flow.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(flow.getByText(/In the chair now with Drew|Walk-in #\d+ for Drew/)).toBeVisible();
    for (const b of await flow
      .locator('.exq-flow__rail .exq-btn, .exq-flow__ticket .exq-btn')
      .all()) {
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await flow.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('.exq-team-next__who')).toHaveText('Now Phone Client');
    // Hand the chair back for the specs that follow.
    await page.getByRole('button', { name: 'Done', exact: true }).first().click();
  });

  test('a half-entered booking asks before it is discarded, in the app and not the browser', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await signInOwner(page);
    await page.locator('.exq-topbar').getByRole('button', { name: 'New booking' }).click();
    const flow = page.getByRole('dialog', { name: 'New booking' });
    await flow.getByRole('button', { name: /^Haircut\b(?! and| with)/ }).click();
    // The X asks; Keep going returns to the flow with the pick intact.
    await flow.getByRole('button', { name: 'Close' }).first().click();
    const ask = page.getByRole('dialog', { name: 'Discard this booking?' });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Keep going' }).click();
    await expect(ask).toBeHidden();
    await expect(flow.getByRole('button', { name: /^Haircut\b(?! and| with)/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Escape asks too; Discard closes everything.
    await page.keyboard.press('Escape');
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Discard' }).click();
    await expect(flow).toBeHidden();
  });

  for (const size of [WIDE, PHONE]) {
    test(`every booking entry point opens the full-screen flow, never a side drawer, at ${String(size.width)}`, async ({
      page,
      context,
    }) => {
      const { code } = await bookPublicly(page, 'nelly', { name: 'Entry Point Client' });
      await context.clearCookies();
      await page.setViewportSize(size);
      await signInOwner(page);
      const open = async (label: string, run: () => Promise<void>) => {
        await run();
        await expect(fullScreen(page), label).toHaveCount(1);
        await expect(page.locator('.exq-flow'), label).toBeVisible();
        await page
          .locator(
            '.exq-dialog[data-variant="full"] > .exq-dialog__inner > .exq-dialog__head .exq-dialog__close',
          )
          .click();
        const ask = page.getByRole('dialog', { name: 'Discard this booking?' });
        if (await ask.isVisible()) await ask.getByRole('button', { name: 'Discard' }).click();
        await expect(fullScreen(page), label).toHaveCount(0);
      };
      await open('New booking', () =>
        page.locator('.exq-topbar').getByRole('button', { name: 'New booking' }).click(),
      );
      await open('Add walk-in', () => page.getByRole('button', { name: 'Add walk-in' }).click());
      // Move and Reschedule from the booking sheet (details only; the change opens the flow).
      await page.getByRole('combobox', { name: 'Search bookings and customers' }).fill(code);
      await page.getByRole('listbox').getByRole('option').first().click();
      const sheet = page.getByRole('dialog', { name: 'Booking', exact: true });
      await expect(sheet.getByText(code)).toBeVisible();
      await open('Move', () =>
        sheet.getByRole('button', { name: 'Move to another barber' }).click(),
      );
      await expect(sheet).toBeVisible();
      await open('Reschedule', () => sheet.getByRole('button', { name: 'Reschedule' }).click());
      await page.keyboard.press('Escape');
      // The portal's Add booking.
      await context.clearCookies();
      await signInBarber(page, 'Lee');
      await open('Portal Add booking', () =>
        page.getByRole('button', { name: 'Add booking' }).click(),
      );
      await open('Portal Walk-in', () => page.getByRole('button', { name: 'Walk-in' }).click());
    });
  }
});
