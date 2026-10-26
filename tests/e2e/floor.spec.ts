import { expect, test } from '@playwright/test';
import { serviceListResponseSchema, staffListResponseSchema } from '../../shared/api/admin';
import { randomPhone, signInOwner } from './owner';

/**
 * Shop, Today at 1180 (the shop tablet): a booking later today moves from Coming up (Arrived,
 * Start) into Lee's chair card and out again with Done, and the numbers follow.
 */
test('Arrived, Start and Done work from Today', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await signInOwner(page);
  // The page's own fetch carries the session cookie; the request context does not.
  const get = (path: string) =>
    page.evaluate(async (p) => (await fetch(p)).json() as Promise<unknown>, path);
  const staff = staffListResponseSchema.parse(await get('/api/admin/staff'));
  const services = serviceListResponseSchema.parse(await get('/api/admin/services'));
  const lee = staff.staff.find((s) => s.slug === 'lee');
  const cut = services.services.find((s) => /^Haircut$/.test(s.name));
  expect(lee && cut).toBeTruthy();
  const name = `Floor Client ${String(Date.now()).slice(-5)}`;
  // A walk-in due at the next quarter hour at least five minutes away: walk-ins are allowed
  // outside shop hours, so this works whatever the hour (the one gap is the last quarter before
  // midnight in the shop).
  const grid = 15 * 60_000;
  const startAt = new Date(Math.ceil((Date.now() + 5 * 60_000) / grid) * grid).toISOString();
  const created = await page.evaluate(
    async (body) => {
      const res = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': `floor-${String(Date.now())}`,
        },
        body: JSON.stringify(body),
      });
      return { ok: res.ok, text: await res.text() };
    },
    {
      source: 'walkIn',
      serviceIds: [cut?.id],
      staff: lee?.id,
      startAt,
      customer: { name, phone: randomPhone(), email: null },
      notifyCustomer: false,
    },
  );
  expect(created.ok, created.text).toBe(true);

  await page.goto('/admin/shop/today');
  const row = page.locator('.exq-coming__row', { hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Walk-in');
  await row.getByRole('button', { name: 'Arrived' }).click();
  await expect(page.getByText(/arrived\.$/).first()).toBeVisible();
  await expect(row).toContainText(/Arrived \d{1,2}:\d{2} (AM|PM)/);
  await expect(row.getByRole('button', { name: 'Arrived' })).toHaveCount(0);

  await row.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText(/^Started .* with Lee\.$/)).toBeVisible();
  const card = page.locator('.exq-floorcard', { hasText: 'Lee' });
  await expect(card).toHaveAttribute('data-kind', 'inChair');
  await expect(card).toContainText(name);
  await expect(card.getByRole('progressbar')).toBeVisible();
  await expect(card).toContainText(
    /Started \d{1,2}:\d{2} (AM|PM) · done about \d{1,2}:\d{2} (AM|PM)/,
  );
  await expect(row).toHaveCount(0);
  await expect(page.locator('.exq-today__pill', { hasText: /in chair/ })).toContainText(/^[1-9]/);

  const doneBefore = Number(
    (await page.locator('.exq-sofar__tile', { hasText: 'Done' }).locator('dd').textContent()) ??
      '0',
  );
  await card.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/is done\.$/)).toBeVisible();
  await expect(page.locator('.exq-donelist__row', { hasText: name })).toBeVisible();
  await expect(page.locator('.exq-sofar__tile', { hasText: 'Done' }).locator('dd')).toHaveText(
    String(doneBefore + 1),
  );
  await expect(page.getByRole('link', { name: `All ${String(doneBefore + 1)}` })).toHaveAttribute(
    'href',
    '/admin/shop/bookings?range=today&status=completed',
  );
  // Lee's chair is handed back (undo, then cancel) so the barber portal tests that follow can
  // start a walk-in with Lee right away.
  const id = (JSON.parse(created.text) as { booking: { id: string } }).booking.id;
  for (const [path, body] of [
    ['status', { status: 'confirmed', notify: false }],
    ['cancel', { notify: false }],
  ] as const) {
    const res = await page.evaluate(
      async ([p, b]) =>
        (
          await fetch(`/api/admin/bookings/${p}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(b),
          })
        ).ok,
      [`${id}/${path}`, body] as const,
    );
    expect(res, path).toBe(true);
  }
  // Tap targets on the tablet are at least 44px.
  for (const b of await page
    .locator('.exq-coming__actions .exq-btn, .exq-floorcard__actions .exq-btn')
    .all()) {
    expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
