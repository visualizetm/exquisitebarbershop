import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInOwner } from './owner';

/** The website editor at 1440: the preview follows the unsaved headline, Save and publish puts it on Home. */
test('editing the headline shows in the preview, saves, and lands on the public home page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInOwner(page);
  await page.goto('/admin/website?section=top');
  const headline = page.getByLabel('Headline');
  const original = await headline.inputValue();
  const stamp = String(Date.now()).slice(-4);
  const next = `Fresh fades. Clean${stamp} lines.`;
  await headline.fill(next);
  await page.getByLabel('Word in red').fill(`Clean${stamp}`);
  // The preview follows the draft before anything is saved, with the red word on its own line.
  const preview = page.getByTestId('preview-headline').first();
  await expect(preview).toContainText(`Clean${stamp}`);
  await expect(preview.locator('[data-accent="true"]')).toHaveText(`Clean${stamp}`);
  await expect(page.getByRole('status').filter({ hasText: 'Unsaved changes' })).toBeVisible();
  // Leaving with unsaved changes asks in a sheet; Keep editing stays.
  await page.getByRole('button', { name: /^Hours/ }).click();
  const ask = page.getByRole('dialog', { name: 'Leave without saving?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Keep editing' }).click();
  await expect(ask).toBeHidden();
  await expect(page).toHaveURL(/section=top$/);
  // Computer view shows the same copy; axe is clean on the editor.
  await page.getByRole('button', { name: 'Computer' }).click();
  await expect(page.getByTestId('preview-headline').first()).toContainText(`Clean${stamp}`);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);

  await page.getByRole('button', { name: 'Save and publish' }).click();
  await expect(page.getByText('All changes saved and live').first()).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Clean${stamp}`);
  await expect(page.locator('.exq-hero__title [data-accent="true"]')).toHaveText(/Clean\d+/);

  // Put today's copy back for the specs that follow.
  await page.goto('/admin/website?section=top');
  await page.getByLabel('Headline').fill(original);
  await page.getByLabel('Word in red').fill('Exquisite');
  await page.getByRole('button', { name: 'Save and publish' }).click();
  await expect(page.getByText('All changes saved and live').first()).toBeVisible();
});

test('the editor at 390 is one column with a full-screen Preview, and axe is clean', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInOwner(page);
  await page.goto('/admin/website?section=top');
  await expect(page.getByRole('heading', { name: 'Top of page', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const full = page.locator('.exq-dialog[data-variant="full"][open]');
  await expect(full).toHaveCount(1);
  await expect(full.getByTestId('preview-headline')).toContainText('Exquisite');
  await page.keyboard.press('Escape');
  await expect(full).toHaveCount(0);
  // Visit and contact saves through the same route.
  await page.getByRole('button', { name: /^Visit, map and contact/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Visit, map and contact', level: 1 }),
  ).toBeVisible();
  await page.getByLabel('Parking').fill('Free lot behind the building, enter from Edgmont Ave.');
  await page.getByRole('button', { name: 'Save and publish' }).click();
  await expect(page.getByText('All changes saved and live').first()).toBeVisible();
  await page.goto('/visit');
  await expect(
    page.getByText('Free lot behind the building, enter from Edgmont Ave.'),
  ).toBeVisible();
});
