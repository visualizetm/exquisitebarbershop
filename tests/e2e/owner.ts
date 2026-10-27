import { expect, type Page } from '@playwright/test';
import { E2E_OWNER } from '../../scripts/e2e-accounts';

/** Signs in at /admin/login as the seeded owner and waits for the dashboard. */
export async function signInOwner(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(E2E_OWNER.email);
  await page.getByLabel('Password').fill(E2E_OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin(?!\/login)/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/**
 * Clears the e2e server's rate-limit windows. A full run books more than ten times from one address,
 * which the real limit (ten per ten minutes) rightly refuses; the hook exists only in
 * scripts/e2e-server.ts.
 */
export async function resetRateLimits(): Promise<void> {
  const api = `http://127.0.0.1:${process.env.API_PORT ?? '3002'}`;
  await fetch(`${api}/__e2e/reset`, { method: 'POST' }).catch(() => undefined);
}

/** A random US number that has not booked before, so the open-bookings guard never trips. */
export function randomPhone(): string {
  return `215555${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

/**
 * Books a Haircut with a chair through the public flow, as a customer would. Returns the
 * reference code and the chosen start time.
 */
export async function bookPublicly(
  page: Page,
  barber: string,
  customer: { name: string; phone?: string } = { name: 'Admin Flow Customer' },
): Promise<{ code: string; startAt: string; phone: string }> {
  const phone = customer.phone ?? randomPhone();
  await resetRateLimits();
  await page.goto(`/book?barber=${barber}`);
  await page.getByLabel(/^Haircut(?! and| with)/).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.exq-day-option[data-state="available"] button').first().click();
  const first = page.locator('.exq-time-option button').first();
  const startAt = (await first.getAttribute('data-start')) ?? '';
  await first.click();
  await page.getByLabel('Name').fill(customer.name);
  await page.getByLabel('Mobile phone').fill(phone);
  // On a phone the bottom bar carries Continue and steps aside while a field has focus.
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByLabel('Mobile phone').blur();
    await page.locator('.exq-bar').getByRole('button', { name: 'Continue' }).click();
  } else {
    await page.getByRole('button', { name: 'Review booking' }).click();
  }
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByRole('heading', { name: 'You are booked' })).toBeFocused();
  const code = (await page.locator('.exq-book-done__code').textContent()) ?? '';
  return { code: code.trim(), startAt, phone };
}
