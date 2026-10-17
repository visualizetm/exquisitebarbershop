import { expect, test } from '@playwright/test';

test('the setup page runs the doctor and setup with the setup secret', async ({ page }) => {
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Set up the site' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  await page.getByLabel('Setup secret (BOOTSTRAP_SECRET)').fill('not-the-secret');
  await page.getByRole('button', { name: 'Run doctor' }).click();
  await expect(page.getByRole('alert')).toContainText('That secret is not right');

  await page
    .getByLabel('Setup secret (BOOTSTRAP_SECRET)')
    .fill('e2e-bootstrap-secret-0123456789abcdef01234');
  await page.getByRole('button', { name: 'Run doctor' }).click();
  const list = page.locator('.exq-setup__list');
  await expect(list.locator('.exq-setup__check')).not.toHaveCount(0);
  await expect(list.locator('.exq-setup__check[data-state="fail"]')).toHaveCount(0);
  await expect(page.getByText('Database: The database answers.')).toBeVisible();

  // Forced, so a reused server that already ran setup still answers with the summary.
  await page.getByRole('checkbox', { name: /Run setup again/ }).check();
  await page.getByRole('button', { name: 'Run setup' }).click();
  await expect(page.getByRole('heading', { name: /Setup ran/ })).toBeVisible();
  await expect(page.getByText(/Shop settings: already there/)).toBeVisible();
});
