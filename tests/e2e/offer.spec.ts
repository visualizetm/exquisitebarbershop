import { expect, test } from '@playwright/test';
import { bookPublicly, randomPhone, resetRateLimits, signInOwner } from './owner';

/** The $10 launch offer, at 390: first online booking gets it, the owner sees it, the same phone does not get it twice. */
test.use({ viewport: { width: 390, height: 844 } });

test('first online booking gets $10 off, the second for the same phone does not', async ({
  page,
}) => {
  await resetRateLimits();
  await page.goto('/');
  await expect(page.locator('.exq-offer-tag').first()).toHaveText(
    '$10 off your first online booking',
  );
  const phone = randomPhone();
  const first = await bookPublicly(page, 'drew', { name: 'Offer Client', phone });
  await expect(page.getByText('First online booking')).toBeVisible();
  await expect(page.getByText('-$10')).toBeVisible();
  await page.screenshot({ path: 'docs/screens/p13e/flow-confirm-offer-390.png', fullPage: false });

  await signInOwner(page);
  await page.goto(`/admin/shop/bookings?q=${first.code}`);
  await page
    .getByRole('button', { name: /Offer Client/ })
    .first()
    .click();
  await expect(page.getByText('$10 off online').first()).toBeVisible();

  await bookPublicly(page, 'drew', { name: 'Offer Client', phone });
  await expect(page.getByText('First online booking')).toHaveCount(0);
});
