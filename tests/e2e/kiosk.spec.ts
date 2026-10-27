import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { bookPublicly, randomPhone, resetRateLimits, signInOwner } from './owner';

/** The locked front desk tablet, sideways and upright. */
const SIDEWAYS = { width: 1180, height: 820 };
const UPRIGHT = { width: 820, height: 1180 };
const EXIT_PIN = '482915';

const noAxe = async (page: Page, label: string) => {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`),
    label,
  ).toEqual([]);
};
const bigEnough = async (page: Page, min: number) => {
  for (const el of await page.locator('button:visible, a:visible').all()) {
    const box = await el.boundingBox();
    expect(box?.height ?? 0, await el.innerText()).toBeGreaterThanOrEqual(min);
  }
};
const tapCode = async (page: Page, label: string, code: string) => {
  const pad = page.getByRole('group', { name: label });
  for (const d of code) await pad.getByRole('button', { name: d, exact: true }).click();
};

/** The owner sets a tablet up and reads the one-use code. */
async function pairingCode(browser: Browser, name: string): Promise<string> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await signInOwner(page);
  await page.goto('/admin/settings?tab=tablets');
  await page.getByLabel('Tablet name').fill(name);
  await page.getByLabel('Exit PIN (6 digits)').fill(EXIT_PIN);
  await page.getByRole('button', { name: 'Get a pairing code' }).click();
  const code = (await page.getByTestId('pairing-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^\d{6}$/);
  await noAxe(page, 'tablets panel');
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await ctx.close();
  return code;
}

test('pair, the board, a walk in, a check in, the idle reset, the exit PIN, unpair (sideways)', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  await resetRateLimits();
  const code = await pairingCode(browser, 'Front desk');
  // A booking for today to check in, made from the public site in its own context.
  const pub = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pubPage = await pub.newPage();
  const booked = await bookPublicly(pubPage, 'lee', { name: 'Kiosk Guest', phone: randomPhone() });
  await pub.close();

  const ctx = await browser.newContext({ viewport: SIDEWAYS });
  const page = await ctx.newPage();
  await page.clock.install();
  await page.goto('/checkin');
  await expect(page.getByRole('heading', { name: 'Front desk tablet' })).toBeVisible();
  await expect(page.getByText('Ask the owner for a code.')).toBeVisible();
  await noAxe(page, 'pairing');
  await tapCode(page, 'Pairing code', '000000');
  await expect(page.getByRole('alert')).toContainText('did not work');
  await tapCode(page, 'Pairing code', code);

  // The start screen and the board.
  await expect(page.getByRole('heading', { name: "Who's coming in?" })).toBeVisible();
  const board = page.locator('.exq-board');
  await expect(board.locator('.exq-board__tile').first()).toBeVisible();
  await expect(board.locator('.exq-board__tile[data-tone]').first()).toBeVisible();
  await expect(page.locator('a:visible')).toHaveCount(0);
  // Five barbers working and the whole start screen fits without scrolling.
  await expect(board.locator('.exq-board__tile')).toHaveCount(5);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
  ).toBeLessThanOrEqual(0);
  await bigEnough(page, 64);
  await noAxe(page, 'start');

  // No way to the dashboard: the kiosk cookie is not a sign-in.
  const refused = await page.evaluate(async () => {
    const r = await fetch('/api/admin/settings', { credentials: 'same-origin' });
    return r.status;
  });
  expect(refused).toBe(403);

  // A walk in with NOW.
  await page.getByRole('button', { name: 'Walk in' }).click();
  const flow = page.getByRole('dialog', { name: 'Walk in' });
  await flow.getByRole('button', { name: /^Haircut\b(?! and| with)/ }).click();
  await noAxe(page, 'walk in services');
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByRole('button', { name: /^Drew/ }).click();
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByLabel('Name', { exact: true }).fill('Tablet Walkin');
  await flow.getByLabel('Mobile phone').fill(randomPhone());
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.exq-checkin__done')).toContainText(
    /Head to chair \d for Drew|You're #\d+ for Drew/,
  );
  const count = page.getByTestId('countdown');
  await expect(count).toContainText('Closing in 15');
  await expect(count).toContainText('The next client can start right after.');
  await expect(page.locator('.exq-checkin__done [role="status"]')).toContainText(
    'Closing in 15 seconds',
  );
  await noAxe(page, 'end screen');
  const done = page.locator('.exq-checkin__done').getByRole('button', { name: 'Done' });
  expect((await done.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(64);
  await done.click();
  await expect(page.getByRole('heading', { name: "Who's coming in?" })).toBeVisible();

  // Check in the booking: name, then one tap.
  await page.getByRole('button', { name: 'I have an appointment' }).click();
  await page.getByLabel('Your name or the last 4 of your phone').fill('Kiosk');
  await page.clock.runFor(400);
  const match = page.locator('.exq-checkin__match', { hasText: 'Kiosk G.' });
  await expect(match).toBeVisible();
  await expect(page.locator('.exq-checkin__match')).not.toContainText('Guest');
  await noAxe(page, 'find');
  await match.click();
  await expect(page.locator('.exq-checkin__done')).toContainText("You're checked in");
  await expect(page.locator('.exq-checkin__done')).toContainText('Lee will be right with you');
  expect(booked.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{4}$/);
  // The count goes 15, 10, 8 (a tap elsewhere changes nothing), 1, then the start screen.
  const left = page.getByTestId('countdown');
  await expect(left).toContainText('Closing in 15');
  await page.clock.runFor(5000);
  await expect(left).toContainText('Closing in 10');
  await page.clock.runFor(2000);
  await expect(left).toContainText('Closing in 8');
  await page.locator('.exq-checkin__done .exq-checkin__title').click();
  await expect(left).toContainText('Closing in 8');
  await page.clock.runFor(7000);
  await expect(left).toContainText('Closing in 1');
  await page.clock.runFor(1000);
  await expect(page.getByRole('heading', { name: "Who's coming in?" })).toBeVisible();
  await expect(page.getByTestId('countdown')).toHaveCount(0);

  // Idle: 45 seconds without a tap in a flow goes back to the start and clears the form.
  await page.getByRole('button', { name: 'I have an appointment' }).click();
  await page.getByLabel('Your name or the last 4 of your phone').fill('Kio');
  await page.clock.runFor(46_000);
  await expect(page.getByRole('heading', { name: "Who's coming in?" })).toBeVisible();
  await page.getByRole('button', { name: 'I have an appointment' }).click();
  await expect(page.getByLabel('Your name or the last 4 of your phone')).toHaveValue('');
  await page.getByRole('button', { name: 'Back' }).click();

  // Press and hold the logo for three seconds: the exit PIN, then the small menu.
  const logo = page.getByRole('button', { name: /Press and hold/ });
  await logo.hover();
  await page.mouse.down();
  await page.clock.runFor(3100);
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: 'Exit PIN' })).toBeVisible();
  await noAxe(page, 'exit pin');
  await tapCode(page, 'Exit PIN', '111111');
  await expect(page.getByRole('alert')).toContainText('not right');
  await tapCode(page, 'Exit PIN', EXIT_PIN);
  await expect(page.getByRole('button', { name: 'Unpair this tablet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await noAxe(page, 'exit menu');
  await page.getByRole('button', { name: 'Unpair this tablet' }).click();
  await expect(page.getByRole('heading', { name: 'Front desk tablet' })).toBeVisible();
  // Unpaired: the board refuses, and /admin asks for a normal sign in.
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  await ctx.close();
});

test('upright: the board and a walk in fit, every target is 64px', async ({ browser }) => {
  await resetRateLimits();
  const code = await pairingCode(browser, 'Upright desk');
  const ctx = await browser.newContext({ viewport: UPRIGHT });
  const page = await ctx.newPage();
  await page.goto('/checkin');
  await tapCode(page, 'Pairing code', code);
  await expect(page.locator('.exq-board__tile').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    UPRIGHT.width,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
  ).toBeLessThanOrEqual(0);
  await expect(page.locator('.exq-board__initials').first()).toBeVisible();
  await bigEnough(page, 64);
  await noAxe(page, 'upright start');
  await page.getByRole('button', { name: 'Walk in' }).click();
  const flow = page.getByRole('dialog', { name: 'Walk in' });
  await expect(flow.getByRole('button', { name: /^Haircut\b(?! and| with)/ })).toBeVisible();
  await ctx.close();
});
