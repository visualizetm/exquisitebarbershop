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
  // On a phone the bottom bar carries Continue; on desktop the form has its own button.
  const phone = (page.viewportSize()?.width ?? 1280) < 1024;
  // The bar steps aside while a field has focus; closing the keyboard brings it back.
  if (phone) await page.getByLabel(/^Email/).blur();
  await (
    phone
      ? page.locator('.exq-bar').getByRole('button', { name: 'Continue' })
      : page.getByRole('button', { name: 'Review booking' })
  ).click();
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
  await expect(page.getByRole('link', { name: 'Manage this booking' })).toHaveAttribute(
    'href',
    /\/manage\?token=v1\./,
  );

  // Refreshing keeps the success screen.
  await page.reload();
  await expect(page.locator('.exq-book-done__code')).toHaveText(code ?? '');

  await page.getByRole('link', { name: 'Manage this booking' }).click();
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
  // The second open day, so the taken time has fresh alternatives whatever the clock says.
  const startAt = await pickFirstDayAndTime(page, 1);
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
      customer: {
        name: 'Faster Customer',
        // A fresh number each run: one phone may hold only a few open bookings.
        phone: `215555${String(Math.floor(Math.random() * 9000) + 1000)}`,
        email: null,
      },
    },
  });
  expect(taken.status(), await taken.text()).toBe(201);

  // On a wide screen the summary card carries the only Confirm button.
  const card = page.getByRole('complementary', { name: 'Your booking' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Beard Trim and Lineup');
  await expect(card).toContainText(/With\s*Dee/);
  await expect(card).toContainText('Pay in the chair. Free to cancel up to 2 hours before.');
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

test('the summary card is disabled until the details step and hidden on a phone', async ({
  page,
}) => {
  await page.goto('/book?barber=marcus');
  const card = page.getByRole('complementary', { name: 'Your booking' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Pick a service to start.');
  await expect(card.getByRole('button', { name: 'Confirm booking' })).toBeDisabled();
  await page.getByLabel(/Classic Cut/).click();
  await expect(card).toContainText('Classic Cut');
  await expect(card).toContainText(/With\s*Marcus/);
  await expect(card).toContainText('$30');
  await expect(card.getByRole('button', { name: 'Confirm booking' })).toBeDisabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).toBeHidden();
  await expect(page.locator('.exq-bar__summary')).toContainText('$30');
});

test('on a phone the Continue bar stays after tapping a service and Confirm appears once', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/book?barber=marcus');
  await page.getByLabel(/Classic Cut/).click();
  // The checkbox keeps focus; the bar must not treat it as typing.
  await expect(page.locator('.exq-bar')).toHaveAttribute('data-state', 'shown');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await pickFirstDayAndTime(page, 1);
  await fillDetails(page, 'phone@example.com');
  await expect(page.getByRole('button', { name: 'Confirm booking' })).toHaveCount(1);
});
