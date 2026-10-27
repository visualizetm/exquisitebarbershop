import { expect, test, type Page } from '@playwright/test';
import { E2E_BARBER_PIN } from '../../scripts/e2e-accounts';
import { randomPhone, resetRateLimits } from './owner';

/**
 * The guard for small phones: no portal screen and no public page scrolls sideways or clips a
 * visible text element at 360 x 740 and 390 x 844.
 */
const SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
];

/** Every visible element that holds text directly must sit inside the viewport and its own box. */
async function expectNoClipping(page: Page, label: string) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const width = window.innerWidth;
    if (document.documentElement.scrollWidth > width) {
      out.push(
        `page scrolls sideways: ${String(document.documentElement.scrollWidth)} > ${String(width)}`,
      );
    }
    const all = Array.from(document.body.querySelectorAll<HTMLElement>('*'));
    for (const el of all) {
      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim() ?? '')
        .join('');
      if (!ownText) continue;
      const rect = el.getBoundingClientRect();
      // Screen reader only text sits in a 1px box on purpose.
      if (rect.width <= 1 || rect.height <= 1) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      // Skip what sits inside a dialog that is closed (display none handles it) or off screen on purpose.
      if (el.closest('[aria-hidden="true"]') && !el.closest('dialog[open]')) continue;
      // A row that scrolls sideways on purpose (the chairs carousel, the day strip) is not clipping.
      let scroller: HTMLElement | null = el.parentElement;
      let insideScroller = false;
      while (scroller && scroller !== document.body) {
        const o = getComputedStyle(scroller).overflowX;
        if (o === 'auto' || o === 'scroll') {
          insideScroller = true;
          break;
        }
        scroller = scroller.parentElement;
      }
      if (insideScroller) continue;
      if (rect.right > width + 1 || rect.left < -1) {
        out.push(
          `"${ownText.slice(0, 30)}" runs off the screen (${String(Math.round(rect.left))} to ${String(Math.round(rect.right))})`,
        );
        continue;
      }
      // A box that hides its overflow and holds more text than it shows is clipped.
      const clips = ['hidden', 'clip'].includes(style.overflowX);
      if (clips && el.scrollWidth > el.clientWidth + 1 && style.textOverflow !== 'ellipsis') {
        out.push(
          `"${ownText.slice(0, 30)}" is cut off by its box (${String(el.scrollWidth)} > ${String(el.clientWidth)})`,
        );
      }
    }
    return out;
  });
  expect(problems, label).toEqual([]);
}

for (const size of SIZES) {
  test(`public pages fit at ${String(size.width)}`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const path of ['/', '/services', '/chairs', '/chairs/drew', '/book', '/visit']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(300);
      await expectNoClipping(page, `${path} at ${String(size.width)}`);
    }
  });

  test(`every portal screen fits at ${String(size.width)}`, async ({ page }) => {
    await page.setViewportSize(size);
    await resetRateLimits();
    await page.goto('/team');
    await expect(page.getByRole('heading', { name: "Who's working?" })).toBeVisible();
    await expectNoClipping(page, 'sign in');
    await page.getByRole('button', { name: /^Nelly Cutz/ }).click();
    const pad = page.getByRole('group', { name: /^PIN for/ });
    await expect(pad).toBeVisible();
    await expectNoClipping(page, 'pin');
    for (const d of E2E_BARBER_PIN) await pad.getByRole('button', { name: d, exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Hey, /, level: 1 })).toBeVisible();
    // A booking in the list, so the rows and the tags are measured too.
    await page.getByRole('button', { name: 'Add booking' }).click();
    const flow = page.getByRole('dialog', { name: 'New booking' });
    await flow.getByRole('button', { name: /^Haircut\b(?! and| with)/ }).click();
    await expectNoClipping(page, 'add booking');
    await flow.getByRole('button', { name: 'Continue' }).click();
    // A later time, never NOW: the chair stays free for the specs that follow.
    await page.locator('.exq-day-option[data-state="available"] button').last().click();
    await page.locator('.exq-time-option button').last().click();
    await flow.getByRole('button', { name: 'Continue' }).click();
    await flow.getByLabel('Name', { exact: true }).fill(`Fit Client ${String(size.width)}`);
    await flow.getByLabel('Mobile phone').fill(randomPhone());
    await flow.getByRole('button', { name: 'Continue' }).click();
    await flow.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(flow.getByText(/^Booked: /)).toBeVisible();
    await flow.getByRole('button', { name: 'Done' }).click();
    await expect(flow).toBeHidden();
    await expectNoClipping(page, 'today');
    await page.getByRole('button', { name: 'Out for the day' }).click();
    await expect(page.getByText(/Block the rest of today\?/)).toBeVisible();
    await expectNoClipping(page, 'out for the day');
    await page.getByRole('button', { name: 'Keep working' }).click();
    for (const tab of ['Week', 'Time off', 'Me']) {
      await page.getByRole('link', { name: tab, exact: true }).click();
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(300);
      await expectNoClipping(page, tab);
    }
  });
}
