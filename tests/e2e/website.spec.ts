import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import { E2E_OWNER } from '../../scripts/e2e-accounts';
import { bookPublicly, signInOwner } from './owner';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const ZONE = 'America/New_York';

// An action that cannot run fails in seconds with its own line, not at the end of the test.
test.use({ actionTimeout: 15_000 });

/** A real PNG made in the browser, so the upload exercises the resize and WebP step. */
async function samplePng(page: Page, color: string): Promise<Buffer> {
  const base64 = await page.evaluate(async (fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 800, 1000);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('no blob'));
      }, 'image/png');
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, color);
  return Buffer.from(base64, 'base64');
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();

test.describe('the website page', () => {
  test('has five tabs, and View on site opens the page the tab changes', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/website');
    await expect(page.getByRole('heading', { name: 'Website', level: 1 })).toBeVisible();
    const expected: [string, string][] = [
      ['Hours', '/visit'],
      ['Announcement', '/'],
      ['Services', '/services'],
      ['Home photo', '/'],
      ['Gallery', '/gallery'],
    ];
    for (const [name, href] of expected) {
      await tab(page, name);
      const link = page.getByRole('link', { name: 'View on site' });
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    }
    // The tab is in the address, so a reload or a shared link lands on the same panel.
    await expect(page).toHaveURL(/tab=gallery/);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Gallery', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('the announcement tab changes the strip on the site, and putting it back is one more save', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/website?tab=announcement');
    const text = page.getByLabel('Text');
    await expect(text).toHaveAttribute('maxlength', '90');
    const visitor = await (await browser.newContext()).newPage();
    try {
      await text.fill('Closed Monday for the holiday');
      await page.getByRole('button', { name: 'Save announcement' }).click();
      await expect(page.getByText(/Announcement saved/).first()).toBeVisible();
      // A toast names its kind with an icon.
      await expect(page.locator('.exq-toast__icon svg').first()).toBeVisible();
      await visitor.goto('/');
      await expect(visitor.locator('.exq-topstrip')).toContainText('Closed Monday for the holiday');
    } finally {
      await text.fill('Walk-ins welcome');
      await page.getByRole('button', { name: 'Save announcement' }).click();
      await expect(page.getByText(/Announcement saved/).last()).toBeVisible();
      await visitor.context().close();
    }
  });

  test('a closed day that hits a booking goes through the resolver before it saves', async ({
    page,
    context,
  }) => {
    const { code, startAt } = await bookPublicly(page, 'lee', { name: 'Closed Day Client' });
    await context.clearCookies();
    const day = DateTime.fromISO(startAt, { zone: ZONE }).toISODate() ?? '';
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/website?tab=hours');
    await page.getByLabel('Day', { exact: true }).fill(day);
    await page.getByLabel('Reason').fill('Staff training');
    await page.getByRole('button', { name: 'Save day' }).click();

    // Nothing is saved until every booked client has a choice.
    const resolver = page.locator('.exq-resolver');
    await expect(resolver.getByText(/^0 of \d+ decided$/)).toBeVisible();
    const apply = page.getByRole('button', { name: 'Apply the change' });
    await expect(apply).toBeDisabled();
    const items = resolver.locator('.exq-resolver__item');
    await expect(items.filter({ hasText: code })).toBeVisible();
    const count = await items.count();
    for (let i = 0; i < count; i += 1) {
      await items.nth(i).getByRole('radio', { name: /^Keep/ }).check({ force: true });
    }
    await expect(page.getByText(`${String(count)} of ${String(count)} decided`)).toBeVisible();
    await apply.click();
    await expect(page.getByText(/is saved\./)).toBeVisible();

    // The closed day is listed, and removing it puts the shop back.
    const row = page.getByRole('button', { name: /Remove .*Staff training/ });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByText('Removed.')).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  test('services: add, edit, hide and reorder show on the site right away', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/website?tab=services');
    const name = `Hot Towel ${String(Date.now()).slice(-5)}`;
    await page.getByRole('button', { name: 'Add service' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add service' });
    await sheet.getByLabel('Name', { exact: true }).fill(name);
    await sheet.getByLabel('Description').fill('A towel, a razor and a steady hand.');
    await sheet.getByLabel('Price in dollars').fill('18.50');
    await sheet.getByLabel('Minutes').fill('25');
    await sheet.getByLabel('Lee').check();
    await sheet.getByRole('button', { name: 'Add service' }).click();
    await expect(page.getByText(new RegExp(`${name} is saved`))).toBeVisible();
    const row = page.locator('.exq-svc', { hasText: name });
    await expect(row).toContainText('25 min');
    await expect(row).toContainText('$18.50');

    const visitor = await (await browser.newContext()).newPage();
    try {
      await visitor.goto('/services');
      await expect(visitor.getByText(name).first()).toBeVisible();

      // Edit: the price changes everywhere.
      await row.getByRole('button', { name: 'Edit' }).click();
      const edit = page.getByRole('dialog', { name: 'Edit service' });
      await edit.getByLabel('Price in dollars').fill('20.00');
      await edit.getByRole('button', { name: 'Save service' }).click();
      await expect(row).toContainText(/\$20(?!\.)/);

      // Reorder: Up moves it above the one before it, and the order sticks after a reload.
      const names = async () =>
        (await page.locator('.exq-svc strong').allTextContents()).map((t) => t.trim());
      const before = await names();
      const at = before.indexOf(name);
      if (at > 0) {
        await page.getByRole('button', { name: `Move ${name} up` }).click();
        await expect(page.getByText('Order saved.').first()).toBeVisible();
        await page.reload();
        await expect(row).toBeVisible();
        expect((await names()).indexOf(name)).toBe(at - 1);
      }

      // Hide: off the site, still in the list as Hidden, and Show brings it back.
      await row.getByRole('button', { name: 'Hide' }).click();
      await expect(row).toContainText('Hidden');
      await visitor.reload();
      await expect(visitor.getByText(name)).toHaveCount(0);
    } finally {
      await visitor.context().close();
    }
  });

  test('home photo: preview, replace, and the home page shows it', async ({ page, browser }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/website?tab=photo');
    await expect(page.getByText('On a phone')).toBeVisible();
    await expect(page.getByText('On a computer')).toBeVisible();
    const png = await samplePng(page, '#2a4d69');
    await page.getByLabel(/Choose a (new )?photo/).setInputFiles({
      name: 'hero.png',
      mimeType: 'image/png',
      buffer: png,
    });
    const alt = `The shop floor ${Date.now()}`;
    await page.getByLabel('Describe the photo (alt text)').fill(alt);
    await page.getByRole('button', { name: /(Add|Replace) home photo/ }).click();
    await expect(page.getByText(/Home photo replaced/)).toBeVisible();

    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto('/');
    await expect(visitor.locator('.exq-hero__photo img').first()).toHaveAttribute('alt', alt);
    await visitor.context().close();
    // Replacing again leaves exactly one home photo.
    const photos = await page.evaluate(async () => {
      const res = await fetch('/api/admin/photos?kind=hero');
      return ((await res.json()) as { photos: unknown[] }).photos;
    });
    expect(photos).toHaveLength(1);
  });

  test('gallery: upload two, tag a barber, reorder, edit alt text and remove', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/website?tab=gallery');
    const stamp = String(Date.now()).slice(-6);
    await page.getByLabel('Add photos').setInputFiles([
      { name: 'one.png', mimeType: 'image/png', buffer: await samplePng(page, '#7a1f1f') },
      { name: 'two.png', mimeType: 'image/png', buffer: await samplePng(page, '#1f7a4a') },
    ]);
    // Alt text is required for every photo, so upload stays off until both have it.
    const upload = page.getByRole('button', { name: 'Upload 2 photos' });
    await expect(upload).toBeDisabled();
    await page.getByLabel('Alt text for one.png').fill(`First fade ${stamp}`);
    await expect(upload).toBeDisabled();
    await page.getByLabel('Alt text for two.png').fill(`Second taper ${stamp}`);
    await page.getByLabel('Credit the work to').first().selectOption({ label: 'Lee' });
    await expect(upload).toBeEnabled();
    await upload.click();
    await expect(page.getByText('2 photos added to the gallery.')).toBeVisible();

    const item = (alt: string) =>
      page.locator('.exq-gphoto', { has: page.locator(`input[value="${alt}"]`) });
    const first = item(`First fade ${stamp}`);
    const second = item(`Second taper ${stamp}`);
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    await expect(first.getByLabel('Credit the work to')).toHaveValue(/[0-9a-f]{24}/);

    // The public gallery shows both, newest or ordered first; the owner puts the second ahead.
    const visitor = await (await browser.newContext()).newPage();
    try {
      await visitor.goto('/gallery');
      await expect(visitor.locator(`img[alt="First fade ${stamp}"]`)).toBeVisible();

      // Whichever of the two is lower goes up one place, and the order sticks after a reload.
      const order = async () =>
        (
          await page
            .locator('.exq-gphoto input.exq-field__control')
            .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
        ).filter((v) => v.endsWith(stamp));
      const before = await order();
      expect(before).toHaveLength(2);
      const [top, lower] = before as [string, string];
      await page.getByRole('button', { name: `Move ${lower} up` }).click();
      await expect(page.getByText('Order saved.').first()).toBeVisible();
      await page.reload();
      await expect(page.locator('.exq-gphoto').first()).toBeVisible();
      expect(await order()).toEqual([lower, top]);
      const alts = await page
        .locator('.exq-gphoto input.exq-field__control')
        .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));

      // Edit the alt text of the photo that is now second (found by place, since its text changes).
      const place = alts.indexOf(`First fade ${stamp}`);
      const editing = page.locator('.exq-gphoto').nth(place);
      await editing.getByLabel('Alt text').fill(`First fade, edited ${stamp}`);
      await editing.getByRole('button', { name: 'Save' }).click();
      await expect(
        page.getByRole('button', { name: `Remove First fade, edited ${stamp}` }),
      ).toBeVisible();
      await visitor.reload();
      await expect(visitor.locator(`img[alt="First fade, edited ${stamp}"]`)).toBeVisible();

      // Remove both.
      for (const alt of [`First fade, edited ${stamp}`, `Second taper ${stamp}`]) {
        await page.getByRole('button', { name: `Remove ${alt}` }).click();
        await page
          .getByRole('dialog', { name: 'Remove this photo?' })
          .getByRole('button', { name: 'Remove it' })
          .click();
        await expect(page.locator(`input[value="${alt}"]`)).toHaveCount(0);
      }
      await visitor.reload();
      await expect(visitor.locator(`img[alt$="${stamp}"]`)).toHaveCount(0);
    } finally {
      await visitor.context().close();
    }
  });
});

test.describe('settings', () => {
  test('shop info saves and rejects a bad social link', async ({ page, browser }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    const tiktok = page.getByLabel('TikTok page');
    const original = await tiktok.inputValue();
    try {
      await tiktok.fill('https://example.com/not-tiktok');
      await page.getByRole('button', { name: 'Save shop info' }).click();
      await expect(page.getByRole('alert').filter({ hasText: /TikTok/ })).toBeVisible();
      await tiktok.fill('https://tiktok.com/@exquisitebarberbeauty');
      await page.getByRole('button', { name: 'Save shop info' }).click();
      await expect(page.getByText(/Shop info saved/)).toBeVisible();
      // The public shop details carry it, which is what the footer reads.
      const shop = await page.request.get('/api/shop');
      expect(((await shop.json()) as { social: { tiktokUrl: string } }).social.tiktokUrl).toBe(
        'https://tiktok.com/@exquisitebarberbeauty',
      );
      // ... and the footer then shows the icon, with its words, in a new tab.
      const visitor = await (await browser.newContext()).newPage();
      await visitor.goto('/');
      const link = visitor.getByRole('link', { name: 'Exquisite on TikTok' });
      await expect(link).toHaveAttribute('href', 'https://tiktok.com/@exquisitebarberbeauty');
      await expect(link).toHaveAttribute('target', '_blank');
      await visitor.context().close();
    } finally {
      await tiktok.fill(original);
      await page.getByRole('button', { name: 'Save shop info' }).click();
      await expect(page.getByText(/Shop info saved/).last()).toBeVisible();
    }
  });

  test('booking rules are in hours and one cutoff covers cancel and reschedule', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/settings?tab=rules');
    const cutoff = page.getByLabel(/Customers can cancel or reschedule online until/);
    const original = await cutoff.inputValue();
    try {
      await cutoff.fill('6');
      await page.getByRole('button', { name: 'Save booking rules' }).click();
      await expect(page.getByText(/Booking rules saved/)).toBeVisible();
      const { settings } = await page.evaluate(async () => {
        const res = await fetch('/api/admin/settings');
        return (await res.json()) as {
          settings: { booking: { cancelCutoffMinutes: number; rescheduleCutoffMinutes: number } };
        };
      });
      expect(settings.booking.cancelCutoffMinutes).toBe(360);
      expect(settings.booking.rescheduleCutoffMinutes).toBe(360);
    } finally {
      await cutoff.fill(original);
      await page.getByRole('button', { name: 'Save booking rules' }).click();
      await expect(page.getByText(/Booking rules saved/).last()).toBeVisible();
    }
  });

  test('account: the sign-in email changes with the password, and email is read-only', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInOwner(page);
    await page.goto('/admin/settings?tab=account');
    const next = `owner.${String(Date.now()).slice(-6)}@example.com`;
    // A wrong password changes nothing.
    await page.getByLabel('New email').fill(next);
    await page.getByLabel('Current password').first().fill('not the password');
    await page.getByRole('button', { name: 'Change email' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.getByText(`You sign in as ${E2E_OWNER.email}.`)).toBeVisible();

    try {
      await page.getByLabel('Current password').first().fill(E2E_OWNER.password);
      await page.getByRole('button', { name: 'Change email' }).click();
      await expect(page.getByText(`You sign in as ${next}.`)).toBeVisible();
    } finally {
      await page.getByLabel('New email').fill(E2E_OWNER.email);
      await page.getByLabel('Current password').first().fill(E2E_OWNER.password);
      await page.getByRole('button', { name: 'Change email' }).click();
      await expect(page.getByText(`You sign in as ${E2E_OWNER.email}.`)).toBeVisible();
    }

    await tab(page, 'Email');
    await expect(page.getByRole('heading', { name: /^Email is (on|off)$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0);
    // Demo data is only there in demo mode.
    await expect(page.getByRole('tab', { name: 'Demo data' })).toHaveCount(0);
  });
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe finds nothing on the website and settings tabs, ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('exq-theme', t);
    }, theme);
    await signInOwner(page);
    for (const size of [DESKTOP, PHONE]) {
      await page.setViewportSize(size);
      const pages = [
        ...['hours', 'announcement', 'services', 'photo', 'gallery'].map(
          (t) => `/admin/website?tab=${t}`,
        ),
        ...['shop', 'rules', 'account', 'email'].map((t) => `/admin/settings?tab=${t}`),
      ];
      for (const url of pages) {
        await page.goto(url);
        await expect(page.getByRole('tabpanel')).toBeVisible();
        await page.waitForTimeout(400);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(
          results.violations.map(
            (v) => `${url} ${String(size.width)} ${v.id}: ${v.nodes[0]?.html ?? ''}`,
          ),
          url,
        ).toEqual([]);
      }
    }
  });
}
