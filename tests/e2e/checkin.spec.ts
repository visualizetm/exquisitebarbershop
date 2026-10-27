import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_BARBER_PIN } from '../../scripts/e2e-accounts';
import { serviceListResponseSchema, staffListResponseSchema } from '../../shared/api/admin';
import { randomPhone, resetRateLimits, signInOwner } from './owner';

/** The shop tablet, upright and sideways. */
const TABLET = { width: 1180, height: 820 };
const TABLET_UP = { width: 820, height: 1180 };

const fullScreen = (page: Page) => page.locator('.exq-dialog[data-variant="full"][open]');
const noAxe = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
};
const bigEnough = async (page: Page, min = 44) => {
  for (const el of await page.locator('button:visible, a:visible').all()) {
    expect((await el.boundingBox())?.height ?? 0, await el.innerText()).toBeGreaterThanOrEqual(min);
  }
};

async function walkIn(page: Page, name: string, barber: RegExp) {
  await page.getByRole('button', { name: 'Walk in' }).click();
  const flow = page.getByRole('dialog', { name: 'Walk in' });
  await expect(fullScreen(page)).toHaveCount(1);
  // No Time step on the tablet: it is always now.
  await expect(flow.getByRole('button', { name: /^Step \d: Time/ })).toHaveCount(0);
  await flow.getByRole('button', { name: /^Haircut\b(?! and| with)/ }).click();
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByRole('button', { name: barber }).click();
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByLabel('Name', { exact: true }).fill(name);
  await flow.getByLabel('Mobile phone').fill(randomPhone());
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(fullScreen(page)).toHaveCount(0);
}

test.describe('the front desk check in at 1180x820', () => {
  test('walk in to a free chair, then the same chair again joins the line', async ({ page }) => {
    await page.setViewportSize(TABLET);
    await signInOwner(page);
    await page.getByRole('link', { name: 'Check in' }).click();
    await expect(page).toHaveURL(/\/admin\/checkin$/);
    await expect(page.getByRole('heading', { name: "Who's coming in?" })).toBeVisible();
    await expect(page.locator('.exq-topbar')).toHaveCount(0);
    await expect(page.getByText('Chairs right now')).toBeVisible();
    await expect(page.locator('.exq-checkin__chair', { hasText: 'Nelly Cutz' })).toContainText(
      /Free now|Free about|Off today/,
    );
    await noAxe(page);
    await bigEnough(page);
    for (const choice of await page.locator('.exq-checkin__choice').all()) {
      expect((await choice.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(64);
    }

    const first = `Desk Walk ${String(Date.now()).slice(-5)}`;
    await walkIn(page, first, /^Nelly Cutz/);
    const done = page.locator('.exq-checkin__done');
    await expect(done).toContainText(/Head to chair 4 for Nelly Cutz/);
    await done.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: "Who's coming in?" })).toBeVisible();

    const second = `Desk Line ${String(Date.now()).slice(-5)}`;
    await walkIn(page, second, /^Nelly Cutz/);
    await expect(done).toContainText(/You're #\d+ for Nelly Cutz/);
    await expect(done).toContainText('Have a seat');
    // The end screen counts down from 15 and goes back to the start on its own.
    await expect(done).toContainText('Closing in');
    await expect(page.getByRole('heading', { name: "Who's coming in?" })).toBeVisible({
      timeout: 25_000,
    });

    // Exit, then hand the chair back and take the second person out of the line.
    await page.getByRole('link', { name: 'Exit' }).click();
    await expect(page).toHaveURL(/\/admin\/shop\/today$/);
    await page
      .locator('.exq-line__card', { hasText: second })
      .getByRole('button', { name: `${second} left` })
      .click();
    const card = page.locator('.exq-floorcard', { hasText: 'Nelly Cutz' });
    await expect(card).toContainText(first);
    await card.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(/is done\.$/)).toBeVisible();
  });

  test('I have an appointment: the last 4 of the phone finds today, masked, and the tap marks arrived', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET);
    await signInOwner(page);
    const get = (path: string) =>
      page.evaluate(async (p) => (await fetch(p)).json() as Promise<unknown>, path);
    const staff = staffListResponseSchema.parse(await get('/api/admin/staff'));
    const services = serviceListResponseSchema.parse(await get('/api/admin/services'));
    const dontrise = staff.staff.find((s) => s.slug === 'dontrise');
    const cut = services.services.find((s) => /^Haircut$/.test(s.name));
    expect(dontrise && cut).toBeTruthy();
    const phone = randomPhone();
    const name = `Desk Appt ${String(Date.now()).slice(-4)} Carter`;
    const grid = 15 * 60_000;
    const startAt = new Date(Math.ceil((Date.now() + 35 * 60_000) / grid) * grid).toISOString();
    const created = await page.evaluate(
      async (body) => {
        const res = await fetch('/api/admin/bookings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': `desk-${String(Date.now())}`,
          },
          body: JSON.stringify(body),
        });
        return { ok: res.ok, text: await res.text() };
      },
      {
        source: 'walkIn',
        serviceIds: [cut?.id],
        staff: dontrise?.id,
        startAt,
        customer: { name, phone, email: null },
        notifyCustomer: false,
      },
    );
    expect(created.ok, created.text).toBe(true);
    const id = (JSON.parse(created.text) as { booking: { id: string } }).booking.id;

    await page.goto('/admin/checkin');
    await page.getByRole('button', { name: 'I have an appointment' }).click();
    const box = page.getByLabel('Your name or the last 4 of your phone');
    await box.fill(phone.slice(-4));
    const tile = page.locator('.exq-checkin__match', { hasText: 'with Dontrise' });
    await expect(tile).toContainText(`Desk C.`);
    await expect(tile).toContainText(/\d{1,2}:\d{2} (AM|PM)/);
    // Masked: no phone, no email, no full name anywhere on the screen.
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(body).not.toContain(phone.slice(-7));
    expect(body).not.toContain('Carter');
    expect(body).not.toContain('@');
    await noAxe(page);
    await bigEnough(page);
    await tile.click();
    const done = page.locator('.exq-checkin__done');
    await expect(done).toContainText(/Thanks, Desk\. You're checked in\./);
    await expect(done).toContainText(/Dontrise will be right with you/);
    const after = (await get(`/api/admin/bookings/${id}`)) as {
      booking: { arrivedAt: string | null };
    };
    expect(after.booking.arrivedAt).not.toBeNull();
    // Already checked in shows as such and nothing breaks on a second tap.
    await done.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'I have an appointment' }).click();
    await box.fill('Desk');
    await expect(tile).toContainText('already checked in');
    // Cancel it so Dontrise's chair is free for the specs that follow.
    const cancelled = await page.evaluate(async (bookingId) => {
      const res = await fetch(`/api/admin/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'e2e cleanup', notify: false }),
      });
      return res.ok;
    }, id);
    expect(cancelled).toBe(true);
  });

  test('a barber opens the check in from the portal, sideways too, and Exit goes back', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET_UP);
    await resetRateLimits();
    await page.goto('/team');
    await page.getByRole('button', { name: /^Drew/ }).click();
    const pad = page.getByRole('group', { name: /^PIN for/ });
    for (const d of E2E_BARBER_PIN) await pad.getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('link', { name: 'Check in' }).click();
    await expect(page).toHaveURL(/\/team\/checkin$/);
    await expect(page.getByRole('heading', { name: "Who's coming in?" })).toBeVisible();
    await expect(page.locator('.exq-checkin__chair', { hasText: 'Drew' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      820,
    );
    await noAxe(page);
    // The walk-in flow on a barber's tablet skips the barber step.
    await page.getByRole('button', { name: 'Walk in' }).click();
    const flow = page.getByRole('dialog', { name: 'Walk in' });
    await expect(flow.getByRole('button', { name: /^Step \d: Barber/ })).toHaveCount(0);
    await flow.getByRole('button', { name: 'Close' }).first().click();
    await expect(fullScreen(page)).toHaveCount(0);
    await page.getByRole('link', { name: 'Exit' }).click();
    await expect(page).toHaveURL(/\/team$/);
  });
});
