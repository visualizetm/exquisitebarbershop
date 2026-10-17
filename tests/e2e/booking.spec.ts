import { expect, test, type Page } from '@playwright/test';

const REFERENCE = /[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{4}/;

async function pickFirstDayAndTime(page: Page, dayIndex = 0): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Pick a day' })).toBeFocused();
  await page.locator('.exq-day-option[data-state="available"] button').nth(dayIndex).click();
  await expect(page.getByRole('heading', { name: 'Pick a time' })).toBeFocused();
  const first = page.locator('.exq-time-option button').first();
  const startAt = (await first.getAttribute('data-start')) ?? '';
  await first.click();
  return startAt;
}

async function fillDetails(page: Page, email: string) {
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeFocused();
  await page.getByLabel('Name').fill('Playwright Customer');
  await page
    .getByLabel('Mobile phone')
    .fill(`215555${String(Math.floor(Math.random() * 9000) + 1000)}`);
  await page.getByLabel(/^Email/).fill(email);
  await page.getByRole('button', { name: 'Review booking' }).click();
  await expect(page.getByRole('heading', { name: 'Review and confirm' })).toBeFocused();
}

test('book from a chair link, then reschedule and cancel through the manage link', async ({
  page,
}) => {
  await page.goto('/book?barber=marcus');
  await expect(page.getByRole('heading', { name: 'Choose your services' })).toBeFocused();
  await page.getByLabel(/Classic Cut/).click();
  await expect(page.getByLabel(/Classic Cut/)).toBeChecked();
  await expect(page.locator('.exq-service-picker__total')).toContainText('1 selected');
  await page.getByRole('button', { name: 'Continue' }).click();

  // The chair came from the link, so the flow skips straight to the calendar. The
  // second open day is never today, so the booking is always outside the online
  // reschedule cutoff whatever time the suite runs.
  await pickFirstDayAndTime(page, 1);
  await fillDetails(page, 'playwright@example.com');
  await expect(page.locator('.exq-book-confirm .exq-booking-summary')).toContainText('Marcus');
  await page.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.getByRole('heading', { name: 'You are booked' })).toBeFocused();
  const code = await page.locator('.exq-book-done__code').textContent();
  expect(code).toMatch(REFERENCE);
  await expect(page.locator('.exq-ics-download')).toHaveAttribute('href', /^data:text\/calendar/);
  await expect(page.locator('.exq-book-done__manage-url a')).toHaveAttribute(
    'href',
    /\/manage\?token=v1\./,
  );

  // Refreshing keeps the success screen.
  await page.reload();
  await expect(page.locator('.exq-book-done__code')).toHaveText(code ?? '');

  await page.getByRole('link', { name: 'Cancel or reschedule' }).click();
  await expect(page.getByRole('heading', { name: 'Your appointment' })).toBeFocused();
  await expect(page.locator('.exq-manage__reference')).toContainText(code ?? '');

  await page.getByRole('button', { name: 'Reschedule' }).click();
  await expect(page.getByRole('heading', { name: /Pick a new time/ })).toBeFocused();
  await page.locator('.exq-day-option[data-state="available"] button').nth(1).click();
  await page.locator('.exq-time-option button').nth(2).click();
  await page.getByRole('button', { name: /^Move to/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Your appointment has been moved' }),
  ).toBeFocused();
  await expect(page).toHaveURL(/\/manage\?token=v1\./);

  await page.getByRole('button', { name: 'Back to your booking' }).click();
  await page.getByRole('button', { name: 'Cancel appointment' }).click();
  await expect(page.getByRole('heading', { name: 'Cancel this appointment?' })).toBeFocused();
  await page.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(page.getByRole('heading', { name: 'Your appointment is cancelled' })).toBeFocused();

  // The old link now explains itself instead of showing the booking.
  await page.reload();
  await expect(page.locator('.exq-status[data-state="error"]')).toContainText('already cancelled');
});

test('a conflict shows fresh times inline and keeps the details', async ({ page, request }) => {
  await page.goto('/book?barber=dee');
  await page.getByLabel(/Beard Trim/).click();
  await expect(page.getByLabel(/Beard Trim/)).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  const startAt = await pickFirstDayAndTime(page);
  await fillDetails(page, 'conflict@example.com');

  // Someone else grabs that exact time while this customer is reviewing.
  const taken = await request.post('/api/bookings', {
    headers: { 'Idempotency-Key': `e2e-${Date.now()}`, origin: 'http://127.0.0.1:5174' },
    data: {
      serviceIds: [
        (
          (await (await request.get('/api/services')).json()) as {
            services: { name: string; id: string }[];
          }
        ).services.find((s) => s.name === 'Beard Trim and Lineup')?.id,
      ],
      staff: 'dee',
      startAt,
      customer: { name: 'Faster Customer', phone: '2155550199', email: null },
    },
  });
  expect(taken.status(), await taken.text()).toBe(201);

  await page.getByRole('button', { name: 'Confirm booking' }).click();
  const conflict = page.locator('.exq-book-conflict');
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText('just taken');
  await expect(page.locator('.exq-book-confirm .exq-booking-summary')).toContainText(
    'Playwright Customer',
  );
  await conflict.locator('button').first().click();
  await expect(page.getByRole('heading', { name: 'Review and confirm' })).toBeFocused();
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByRole('heading', { name: 'You are booked' })).toBeFocused();
  await expect(page.locator('.exq-book-done__code')).toHaveText(REFERENCE);
});
