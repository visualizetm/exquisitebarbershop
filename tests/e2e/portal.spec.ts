import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_BARBER_NAMES, E2E_BARBER_PIN } from '../../scripts/e2e-accounts';
import { resetRateLimits, randomPhone, signInOwner } from './owner';

const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE, actionTimeout: 15_000 });

/*
 * A walk-in holds its chair for the next 40 minutes, so every test that adds one has a barber of
 * its own: Lee the barber's day, Drew and Nelly the two axe runs. Iniya signs in without adding
 * anything. Dontrise is kept for the setup and lockout tests, which change that barber's PIN.
 */

async function enterPin(page: Page, pin: string) {
  const pad = page.getByRole('group', { name: /^(PIN for|Choose your PIN|Confirm your PIN)/ });
  for (const digit of pin) await pad.getByRole('button', { name: digit, exact: true }).click();
}

async function signInBarber(page: Page, name: string, pin: string = E2E_BARBER_PIN) {
  await resetRateLimits();
  await page.goto('/team');
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await enterPin(page, pin);
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

/** Walk-in through the full-screen flow: Haircut, NOW, name and phone, confirm. */
async function walkIn(page: Page, name: string, phone: string) {
  await page.getByRole('button', { name: 'Walk-in' }).click();
  const flow = page.getByRole('dialog', { name: 'New booking' });
  await flow.getByRole('button', { name: /^Haircut\b(?! and| with)/ }).click();
  await flow.getByRole('button', { name: 'Continue' }).click();
  await expect(flow.getByRole('button', { name: /^Now/ })).toHaveAttribute('aria-pressed', 'true');
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByLabel('Name', { exact: true }).fill(name);
  await flow.getByLabel('Mobile phone').fill(phone);
  await flow.getByRole('button', { name: 'Continue' }).click();
  await flow.getByRole('button', { name: 'Confirm', exact: true }).click();
  // In the chair when the chair is free for the cut, else a place in the line: both are right here.
  await expect(flow.getByText(/In the chair now with|Walk-in #\d+ for/)).toBeVisible();
  await flow.getByRole('button', { name: 'Done' }).click();
  await expect(flow).toBeHidden();
}

test.describe('signing in', () => {
  test('asks for a name, then a PIN; a wrong PIN says so; the demo PIN is not shown here', async ({
    page,
  }) => {
    await resetRateLimits();
    await page.goto('/team');
    await expect(page.getByRole('heading', { name: 'Who is signing in?' })).toBeVisible();
    // The site-wide bottom bar and header do not belong to the portal.
    await expect(page.locator('.exq-bottombar')).toHaveCount(0);
    await expect(page.getByText(/Demo PIN/)).toHaveCount(0);
    for (const n of E2E_BARBER_NAMES) {
      await expect(page.getByRole('button', { name: new RegExp(`^${n}`) })).toBeVisible();
    }

    await page.getByRole('button', { name: /^Lee/ }).click();
    await expect(page.getByRole('heading', { name: 'Hi, Lee' })).toBeVisible();
    await expect(page.getByText(/Demo PIN/)).toHaveCount(0);
    await expect(page.locator('.exq-pin__dot')).toHaveCount(6);
    // Keys are big enough for a thumb.
    for (const key of await page.locator('.exq-pin__key').all()) {
      expect((await key.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(64);
    }

    // It submits by itself on the sixth digit, and a wrong PIN clears and explains.
    await enterPin(page, '999111');
    await expect(page.getByText('That PIN did not work. Try again.')).toBeVisible();
    await expect(page.locator('.exq-pin__dot[data-state="filled"]')).toHaveCount(0);
    await enterPin(page, E2E_BARBER_PIN);
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    // Reloading keeps the session; the bottom tabs are the four portal screens.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Barber portal' });
    await expect(tabs.getByRole('link')).toHaveText(['Today', 'Week', 'Time off', 'Me']);
    for (const tab of await tabs.getByRole('link').all()) {
      expect((await tab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
  });

  test('the barber cookie opens no dashboard page and the owner screens answer 401', async ({
    page,
  }) => {
    await signInBarber(page, 'Iniya');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
    const statuses = await page.evaluate(async () => {
      const out: number[] = [];
      for (const path of [
        '/api/admin/today',
        '/api/admin/overview',
        '/api/admin/bookings',
        '/api/auth/me',
      ]) {
        out.push((await fetch(path)).status);
      }
      return out;
    });
    expect(statuses).toEqual([401, 401, 401, 401]);
  });
});

test.describe('a barber’s day at 390', () => {
  test('walk-in, next up, done and undo, a note, the week, time off, and sign out', async ({
    page,
  }) => {
    const name = 'Lee';
    const client = `Portal ${String(Date.now()).slice(-6)}`;
    const phone = randomPhone();
    await signInBarber(page, name);

    // Empty or not, the screen is honest about the day.
    await walkIn(page, client, phone);
    const next = page.locator('.exq-team-next');
    await expect(next.locator('.exq-team-next__who')).toHaveText(client);
    // Next up and the first two bookings fit above the tab bar without scrolling.
    const nextBox = await next.boundingBox();
    const rowBox = await page.locator('.exq-team-row').first().boundingBox();
    expect(rowBox).not.toBeNull();
    const tabBarTop = PHONE.height - 56;
    expect((nextBox?.y ?? 0) + (nextBox?.height ?? 0)).toBeLessThan(tabBarTop);
    expect((rowBox?.y ?? 0) + 2 * (rowBox?.height ?? 0) + 8).toBeLessThanOrEqual(tabBarTop);
    // Tap targets are 48px or more.
    for (const label of ['Done', 'No show', 'Walk-in']) {
      const box = await page
        .getByRole('button', { name: label, exact: true })
        .first()
        .boundingBox();
      expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(48);
    }
    // A client's phone number never reaches the barber's screen.
    expect(await page.locator('body').innerText()).not.toContain(phone.slice(-7));

    // Done, then Undo from the toast.
    await next.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(`${client} is done.`)).toBeVisible();
    await expect(page.locator('.exq-team-next')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText(`${client} is back on the schedule.`)).toBeVisible();
    await expect(page.locator('.exq-team-next__who')).toHaveText(client);

    // No show can be undone from the booking sheet too.
    await page.locator('.exq-team-next').getByRole('button', { name: 'No show' }).click();
    await expect(page.getByText(`${client} marked no show.`)).toBeVisible();
    await page.locator('.exq-team-row', { hasText: client }).click();
    const sheet = page.getByRole('dialog', { name: client });
    await sheet.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(`${client} is back on the schedule.`).last()).toBeVisible();

    // A note, and the way to reach the client is the shop.
    await sheet.getByLabel('Note').fill('Likes a number 2 on the sides');
    await sheet.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByText('Note saved.')).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'Call shop' })).toHaveAttribute('href', /^tel:/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.exq-team-next__notes')).toHaveText('Likes a number 2 on the sides');

    // The week shows seven days and the client under today.
    await page.getByRole('link', { name: 'Week', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'This week', level: 1 })).toBeVisible();
    await expect(page.locator('.exq-team-day')).toHaveCount(7);
    await expect(page.locator('.exq-team-day').first()).toContainText(client);

    // Time off: block an evening hour, then take it back.
    await page.getByRole('link', { name: 'Time off' }).click();
    await page.getByRole('button', { name: 'Block time' }).click();
    const block = page.getByRole('dialog', { name: 'Block time' });
    await block.getByLabel('From').fill('22:00');
    await block.getByLabel('To').fill('22:30');
    await block.getByLabel('Reason (optional)').fill('Dinner');
    await block.getByRole('button', { name: 'Block this time' }).click();
    await expect(page.getByText('Time blocked.')).toBeVisible();
    const blocked = page.locator('.exq-team-row', { hasText: 'Dinner' });
    await expect(blocked).toBeVisible();
    await blocked.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Removed.')).toBeVisible();
    await expect(page.locator('.exq-team-row', { hasText: 'Dinner' })).toHaveCount(0);

    // Days off ahead apply right away when the days are empty.
    await page.getByRole('button', { name: 'Days off ahead' }).click();
    const ahead = page.getByRole('dialog', { name: 'Days off ahead' });
    const far = new Date(Date.now() + 70 * 86_400_000).toISOString().slice(0, 10);
    await ahead.getByLabel('First day').fill(far);
    await ahead.getByLabel('Last day').fill(far);
    await ahead.getByRole('button', { name: 'Ask for these days' }).click();
    await expect(page.getByText('Your days off are saved.')).toBeVisible();
    const off = page.locator('.exq-team-row', { hasText: 'Off ' }).first();
    await off.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Removed.')).toBeVisible();

    // I am out today: confirm first; the clients stay; the owner is told.
    await page.getByRole('button', { name: 'I am out today', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Out today?' });
    await expect(confirm).toContainText('Your clients stay booked');
    await confirm.getByRole('button', { name: 'Keep working' }).click();
    await expect(page.getByRole('button', { name: 'I am out today', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'I am out today', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Out today?' })
      .getByRole('button', { name: 'Yes, I am out today' })
      .click();
    await expect(
      page.getByText(/The owner will handle your 1 client\.|You are marked out today\./).first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'I am out today', exact: true })).toHaveCount(0);
    // The client is still booked: nothing was cancelled.
    await page.getByRole('link', { name: 'Today', exact: true }).click();
    await expect(page.locator('.exq-team-row', { hasText: client })).toBeVisible();

    // Me, and sign out.
    await page.getByRole('link', { name: 'Me', exact: true }).click();
    await expect(page.locator('.exq-team-me__name')).toHaveText(name);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Who is signing in?' })).toBeVisible();
    const status = await page.evaluate(async () => (await fetch('/api/team/today')).status);
    expect(status).toBe(401);
  });

  test('changing the PIN refuses a weak one and a wrong current one', async ({ page }) => {
    await signInBarber(page, 'Iniya');
    await page.getByRole('link', { name: 'Me', exact: true }).click();
    await page.getByRole('button', { name: 'Change PIN' }).click();
    const sheet = page.getByRole('dialog', { name: 'Change PIN' });
    await sheet.getByLabel('Current PIN').fill('999111');
    await sheet.getByLabel('New PIN', { exact: true }).fill('290417');
    await sheet.getByLabel('New PIN again').fill('290417');
    await sheet.getByRole('button', { name: 'Save new PIN' }).click();
    await expect(sheet.getByRole('alert')).toContainText('current PIN is not right');
    await sheet.getByLabel('Current PIN').fill(E2E_BARBER_PIN);
    await sheet.getByLabel('New PIN', { exact: true }).fill('123456');
    await sheet.getByLabel('New PIN again').fill('123456');
    await sheet.getByRole('button', { name: 'Save new PIN' }).click();
    await expect(sheet.getByRole('alert')).toContainText('harder to guess');
  });
});

test.describe('setup links and the lockout', () => {
  async function setupLinkFor(page: Page, name: string, signedIn = false): Promise<string> {
    if (!signedIn) await signInOwner(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/admin/team');
    await page.getByRole('link', { name, exact: true }).click();
    await page.getByRole('tab', { name: 'Access' }).click();
    const reset = page.getByRole('button', { name: 'Reset PIN' });
    if (await reset.isEnabled()) {
      await reset.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Reset and copy link' }).click();
    } else {
      await page.getByRole('button', { name: 'Copy setup link' }).click();
    }
    const field = page.getByLabel('Setup link');
    await expect(field).toBeVisible();
    return field.inputValue();
  }

  test('a setup link lets a barber choose a PIN once, and a new link signs them out', async ({
    page,
    browser,
  }) => {
    const link = await setupLinkFor(page, 'Dontrise');
    expect(link).toMatch(/\/team\/setup\/[A-Za-z0-9_-]{43}$/);
    const phone = await (await browser.newContext({ viewport: PHONE })).newPage();
    try {
      await phone.goto(new URL(link).pathname);
      await expect(phone.getByRole('heading', { name: 'Welcome, Dontrise' })).toBeVisible();
      // Too easy: refused before anything is sent.
      await enterPin(phone, '123456');
      await expect(phone.getByText(/harder to guess/)).toBeVisible();
      // Mismatch starts over.
      await enterPin(phone, '290417');
      await expect(phone.getByText('Enter it once more to confirm.')).toBeVisible();
      await enterPin(phone, '290418');
      await expect(phone.getByText('Those two did not match. Start again.')).toBeVisible();
      await enterPin(phone, '290417');
      await enterPin(phone, '290417');
      await expect(phone.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
      await expect(phone.getByRole('link', { name: 'Me', exact: true })).toBeVisible();

      // The link is spent.
      await phone.context().clearCookies();
      await phone.goto(new URL(link).pathname);
      await expect(phone.getByText('This link does not work')).toBeVisible();

      // The owner makes a new link to put Dontrise back on the shared test PIN: it signs the phone out.
      const again = await setupLinkFor(page, 'Dontrise', true);
      await phone.goto('/team');
      await phone.getByRole('button', { name: /^Dontrise/ }).click();
      await enterPin(phone, '290417');
      await expect(phone.getByText(/did not work|Too many/)).toBeVisible();
      await phone.goto(new URL(again).pathname);
      await enterPin(phone, E2E_BARBER_PIN);
      await enterPin(phone, E2E_BARBER_PIN);
      await expect(phone.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    } finally {
      await phone.context().close();
    }
  });

  test('five wrong tries lock a barber, the owner sees it and unlocks', async ({
    page,
    browser,
  }) => {
    await resetRateLimits();
    const phone = await (await browser.newContext({ viewport: PHONE })).newPage();
    try {
      await phone.goto('/team');
      await phone.getByRole('button', { name: /^Dontrise/ }).click();
      for (let i = 0; i < 5; i += 1) {
        await enterPin(phone, `99911${String(i)}`);
        await expect(phone.getByText('That PIN did not work. Try again.')).toBeVisible();
      }
      await enterPin(phone, E2E_BARBER_PIN);
      await expect(phone.getByText(/Too many wrong tries/)).toBeVisible();

      await signInOwner(page);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/admin/team');
      await page.getByRole('link', { name: 'Dontrise', exact: true }).click();
      await page.getByRole('tab', { name: 'Access' }).click();
      await expect(page.getByText(/after 5 wrong tries/)).toBeVisible();
      await page.getByRole('button', { name: 'Unlock' }).click();
      await expect(page.getByText('Dontrise can try again now.')).toBeVisible();

      await phone.goto('/team');
      await phone.getByRole('button', { name: /^Dontrise/ }).click();
      await enterPin(phone, E2E_BARBER_PIN);
      await expect(phone.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    } finally {
      await phone.context().close();
    }
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe finds nothing on any portal screen, ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('exq-theme', t);
    }, theme);
    const check = async (label: string) => {
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(
        results.violations.map((v) => `${label} ${v.id}: ${v.nodes[0]?.html ?? ''}`),
        label,
      ).toEqual([]);
    };
    await resetRateLimits();
    await page.goto('/team');
    await expect(page.getByRole('heading', { name: 'Who is signing in?' })).toBeVisible();
    await check('names');
    const name = theme === 'light' ? 'Drew' : 'Nelly';
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await check('pin');
    await enterPin(page, E2E_BARBER_PIN);
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await walkIn(page, `Axe ${String(Date.now()).slice(-5)}`, randomPhone());
    await check('today');
    await page.locator('.exq-team-row').first().click();
    await check('booking sheet');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Walk-in' }).click();
    await expect(page.getByRole('dialog', { name: 'New booking' })).toBeVisible();
    await check('walk-in flow');
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Week', exact: true }).click();
    await expect(page.locator('.exq-team-day')).toHaveCount(7);
    await check('week');
    await page.getByRole('link', { name: 'Time off' }).click();
    await expect(page.getByRole('heading', { name: 'Time off', level: 1 })).toBeVisible();
    await check('time off');
    await page.getByRole('button', { name: 'Block time' }).click();
    await check('block sheet');
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Me', exact: true }).click();
    await check('me');
    await page.getByRole('button', { name: 'Change PIN' }).click();
    await check('change pin sheet');
  });
}
