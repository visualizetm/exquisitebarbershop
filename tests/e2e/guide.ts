import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { E2E_BARBER, E2E_OWNER } from '../../scripts/e2e-accounts';

/**
 * Phone screenshots for docs/OWNER-GUIDE.md and docs/BARBER-GUIDE.md, taken on
 * the e2e server (never production): `npx tsx tests/e2e/guide.ts`.
 */
const BASE = `http://127.0.0.1:${process.env.WEB_PORT ?? '5174'}`;
const DIR = join('docs', 'guide');

async function shot(page: Page, name: string, full = false): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  const path = join(DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: full });
  process.stdout.write(`${path}\n`);
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin(?!\/login)/);
}

async function main(): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  await fetch(`http://127.0.0.1:${process.env.API_PORT ?? '3002'}/__e2e/reset`, {
    method: 'POST',
  }).catch(() => undefined);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('exq-theme', 'light');
  });

  // 1 Sign in
  await page.goto(`${BASE}/admin/login`);
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await shot(page, '01-sign-in');
  await page.getByLabel('Password').fill(E2E_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin(?!\/login)/);

  // 2 A walk-in, so Today has something in a chair
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('heading', { name: 'New booking' }).waitFor();
  const sheet = page.locator('dialog[open]');
  await sheet.getByLabel('Walk-in').check();
  await sheet.getByLabel(/Classic Cut/).check();
  await sheet.getByLabel('Chair', { exact: true }).first().selectOption({ label: 'Dontrise' });
  await sheet.getByLabel('Name').fill('Walk-in Customer');
  await sheet.getByLabel('Phone', { exact: true }).fill('2155550177');
  await shot(page, '04-new-booking');
  await sheet.getByRole('button', { name: 'Add walk-in' }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await shot(page, '02-today', true);

  // 3 Mark done, then the Undo toast
  const seg = page.locator('.exq-seg').first();
  await seg.getByRole('button', { name: 'Completed' }).click();
  await page.getByRole('status').filter({ hasText: 'Undo' }).waitFor();
  await shot(page, '03-mark-done-undo');

  // 5 Block time
  await page.goto(`${BASE}/admin/schedule`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Block time' }).click();
  await page.getByRole('heading', { name: 'Block time' }).waitFor();
  await shot(page, '05-block-time');
  await page.keyboard.press('Escape');

  // 6 A clash: a day off for Dontrise while the walk-in is in the chair
  await page.goto(`${BASE}/admin/whos-in`, { waitUntil: 'networkidle' });
  await shot(page, '06-whos-in', true);

  // 7 Services and the edit sheet
  await page.goto(`${BASE}/admin/settings/services`, { waitUntil: 'networkidle' });
  await shot(page, '07-services', true);
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByRole('heading', { name: 'Classic Cut' }).waitFor();
  await shot(page, '08-edit-service');
  await page.keyboard.press('Escape');

  // 9 Hours
  await page.goto(`${BASE}/admin/settings/hours`, { waitUntil: 'networkidle' });
  await shot(page, '09-hours', true);

  // 10 Staff and the add sheet
  await page.goto(`${BASE}/admin/settings/staff`, { waitUntil: 'networkidle' });
  await shot(page, '10-staff', true);
  await page.getByRole('button', { name: 'Add a staff member' }).click();
  await page.getByRole('heading', { name: 'Add a staff member' }).waitFor();
  await shot(page, '11-add-staff');
  await page.keyboard.press('Escape');

  // 12 Logins
  await page.goto(`${BASE}/admin/settings/logins`, { waitUntil: 'networkidle' });
  await shot(page, '12-logins', true);

  // 13 Photos
  await page.goto(`${BASE}/admin/photos`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Chairs' }).click();
  await shot(page, '13-photos', true);

  // 14 Account: theme and password
  await page.goto(`${BASE}/admin/account`, { waitUntil: 'networkidle' });
  await shot(page, '14-account', true);

  // 15 The barber's view
  await context.clearCookies();
  await signIn(page, E2E_BARBER.email, E2E_BARBER.password);
  await page.goto(`${BASE}/admin/me`, { waitUntil: 'networkidle' });
  await shot(page, '15-barber-schedule', true);

  await browser.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
