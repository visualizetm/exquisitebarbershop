import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_BARBER_PIN } from '../../scripts/e2e-accounts';
import { randomPhone, resetRateLimits } from './owner';

/** The barber portal redo at 390: card and PIN sign in, Add booking with NOW, Start cut, Done, Out for the day, Sign out. */
const PHONE = { width: 390, height: 844 };

const noAxe = async (page: Page, label: string) => {
  await page.waitForTimeout(300);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
};

test('a barber signs in by card and PIN, books NOW, starts and finishes a cut, goes out for the day and signs out', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await resetRateLimits();
  await page.goto('/team');
  await expect(page.getByRole('heading', { name: "Who's working?" })).toBeVisible();
  const card = page.getByRole('button', { name: /^Nelly Cutz/ });
  await expect(card).toContainText(/Chair 0\d/);
  await noAxe(page, 'cards');
  await card.click();
  await expect(page.getByRole('heading', { name: 'Hi, Nelly Cutz' })).toBeVisible();
  const pad = page.getByRole('group', { name: /^PIN for/ });
  for (const key of await pad.locator('.exq-pin__key').all()) {
    expect((await key.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(64);
  }
  await page.getByRole('button', { name: 'Show' }).click();
  await pad.getByRole('button', { name: '4', exact: true }).click();
  await expect(page.locator('.exq-pin__dot[data-state="filled"]')).toHaveText('4');
  await page.getByRole('button', { name: 'Hide' }).click();
  await noAxe(page, 'pin');
  for (const d of E2E_BARBER_PIN.slice(1))
    await pad.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Hey, Nelly/, level: 1 })).toBeVisible();
  await expect(page.getByText(/Chair 0\d/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await noAxe(page, 'today');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // Add booking: NOW is first and already picked; the walk-in lands in the chair.
  await page.getByRole('button', { name: 'Add booking' }).click();
  const flow = page.getByRole('dialog', { name: 'New booking' });
  await flow.getByRole('button', { name: /^Haircut\b(?! and| with)/ }).click();
  await flow.getByRole('button', { name: 'Continue' }).click();
  await expect(flow.getByRole('button', { name: /^Now/ })).toHaveAttribute('aria-pressed', 'true');
  await flow.getByRole('button', { name: 'Continue' }).click();
  const name = `Portal${String(Date.now()).slice(-4)} Client`;
  await flow.getByLabel('Name', { exact: true }).fill(name);
  await flow.getByLabel('Mobile phone').fill(randomPhone());
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(
    flow.getByText(/In the chair now with Nelly Cutz|Walk-in #\d+ for Nelly Cutz/),
  ).toBeVisible();
  const inChair = (await flow.getByText(/In the chair now/).count()) > 0;
  await flow.getByRole('button', { name: 'Done' }).click();
  await expect(flow).toBeHidden();

  const chair = page.locator('.exq-team-chair');
  if (!inChair) {
    // Somebody from an earlier spec is still in the chair: finish them, then seat the walk-in.
    await chair.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(/is done\.$/).first()).toBeVisible();
    await expect(chair).toContainText('Walk-in');
    await chair.getByRole('button', { name: 'Start cut' }).click();
  }
  await expect(chair).toContainText(name);
  await expect(chair).toHaveAttribute('data-state', 'busy');
  await expect(page.locator('.exq-team-row', { hasText: /Portal\d+ C\./ }).first()).toContainText(
    'Walk-in',
  );
  await chair.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/is done\.$/).first()).toBeVisible();
  await expect(page.locator('.exq-team-row', { hasText: /Portal\d+ C\./ }).first()).toContainText(
    'Done',
  );
  await noAxe(page, 'after done');

  // Out for the day: a full-screen confirm, then the note on Today.
  await page.getByRole('button', { name: 'Out for the day' }).click();
  const ask = page.getByRole('dialog', { name: 'Out for the day' });
  await expect(page.locator('.exq-dialog[data-variant="full"][open]')).toHaveCount(1);
  await expect(ask.getByText(/Block the rest of today\?/)).toBeVisible();
  await expect(ask.getByText(/owner will be asked to move them|Nobody is booked/)).toBeVisible();
  await noAxe(page, 'out confirm');
  await ask.getByRole('button', { name: 'Keep working' }).click();
  await expect(ask).toBeHidden();
  await page.getByRole('button', { name: 'Out for the day' }).click();
  await ask.getByRole('button', { name: 'Block the rest of today' }).click();
  await expect(page.getByText(/You are out/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'marked out today' })).toBeVisible();

  // Me holds the profile, then Sign out from Today.
  await page.getByRole('link', { name: 'Me', exact: true }).click();
  await expect(page.getByText('Specialty')).toBeVisible();
  await noAxe(page, 'me');
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: "Who's working?" })).toBeVisible();
});
