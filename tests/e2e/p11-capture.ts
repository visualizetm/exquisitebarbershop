import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { DEMO_PIN } from '../../shared/lib/pin';
import { randomPhone } from './owner';

/**
 * Prompt 11 screenshots and recordings, from the demo build with sample data:
 *   npm run e2e:prod-server -- --port=4176 --profile=demo
 *
 *   npx tsx tests/e2e/p11-capture.ts milestones   owner and barber screens per milestone
 *   npx tsx tests/e2e/p11-capture.ts guide        the step by step guide screens
 *   npx tsx tests/e2e/p11-capture.ts recordings   two short webm recordings
 *
 * The server is thrown away afterwards, so the script is free to open the hours all day for the
 * recordings (the shop is closed on some days) and to create bookings. The owner signs in with the
 * demo button and the barbers with the demo PIN, exactly as Rob will.
 */
const BASE = process.env.CAPTURE_BASE ?? 'https://127.0.0.1:4176';
const OUT = join('docs', 'screens', 'p11');
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const mode = process.argv[2] ?? 'milestones';

async function launch(): Promise<Browser> {
  return chromium.launch(
    process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  );
}

async function newContext(
  browser: Browser,
  size: { width: number; height: number },
  theme: 'light' | 'dark' = 'light',
  video?: string,
  showNotice = false,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: size,
    reducedMotion: video ? 'no-preference' : 'reduce',
    ignoreHTTPSErrors: true,
    ...(video ? { recordVideo: { dir: video, size } } : {}),
  });
  await context.addInitScript((t) => {
    localStorage.setItem('exq-theme', t);
  }, theme);
  if (!showNotice) {
    await context.addInitScript(() => {
      sessionStorage.setItem('exq-demo-notice-seen', '1');
    });
  }
  return context;
}

async function ownerSignIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/admin/login`);
  await page.getByRole('button', { name: 'Enter demo dashboard' }).click();
  await page.waitForURL(/\/admin(?!\/login)/);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
}

async function shot(page: Page, dir: string, name: string, full = false): Promise<void> {
  mkdirSync(dir, { recursive: true });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(350);
  const path = join(dir, `${name}.png`);
  await page.screenshot({ path, fullPage: full });
  process.stdout.write(`${path}\n`);
}

/** A PNG drawn in the page, so uploads run the real resize. */
async function samplePng(page: Page, text: string, color: string): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([label, fill]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1125;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      ctx.fillStyle = fill ?? '#333';
      ctx.fillRect(0, 0, 900, 1125);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 110px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label ?? '', 450, 590);
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
    },
    [text, color],
  );
  return Buffer.from(base64, 'base64');
}

/** Books a Haircut through the public page, as a customer would. */
async function book(page: Page, barber: string, name: string): Promise<void> {
  await page.goto(`${BASE}/book?barber=${barber}`);
  await page.getByLabel(/^Haircut(?! and| with)/).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.exq-day-option[data-state="available"] button').first().click();
  await page.locator('.exq-time-option button').first().click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Mobile phone').fill(randomPhone());
  await page.getByRole('button', { name: 'Review booking' }).click();
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await page.getByRole('heading', { name: 'You are booked' }).waitFor();
}

/** The demo server has generous limits and no reset hook; kept so the flow reads the same as the e2e one. */
async function resetLimits(): Promise<void> {
  await Promise.resolve();
}

const CLIENTS: [string, string][] = [
  ['lee', 'Terrence Wallace'],
  ['drew', 'Imani Brooks'],
  ['nelly', 'Darnell Hughes'],
  ['dontrise', 'Calvin Rhodes'],
];

export async function makeBookings(browser: Browser): Promise<void> {
  const context = await newContext(browser, DESKTOP);
  const page = await context.newPage();
  for (const [barber, name] of CLIENTS) {
    await resetLimits();
    await book(page, barber, name);
  }
  await context.close();
}

async function pin(page: Page, digits: string): Promise<void> {
  const pad = page.getByRole('group', { name: /^(PIN for|Choose your PIN|Confirm your PIN)/ });
  for (const d of digits) await pad.getByRole('button', { name: d, exact: true }).click();
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

async function ownerPages(
  browser: Browser,
  dir: string,
  paths: [string, string][],
  themes: ('light' | 'dark')[],
) {
  for (const theme of themes) {
    for (const size of [DESKTOP, PHONE]) {
      const context = await newContext(browser, size, theme);
      const page = await context.newPage();
      page.on('pageerror', (e) => process.stdout.write(`pageerror: ${e.message.slice(0, 300)}\n`));
      page.on('requestfailed', (r) =>
        process.stdout.write(`failed: ${r.url().slice(0, 160)} ${r.failure()?.errorText ?? ''}\n`),
      );
      page.on('console', (m) => {
        if (m.type() === 'error')
          process.stdout.write(`console error: ${m.text().slice(0, 300)}\n`);
      });
      await ownerSignIn(page);
      for (const [name, path] of paths) {
        await page.goto(`${BASE}${path}`);
        try {
          await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15_000 });
        } catch (error) {
          process.stdout.write(
            `no heading on ${path}: ${(await page.locator('body').innerText()).slice(0, 200)}\n`,
          );
          throw error;
        }
        await shot(page, dir, `${name}-${theme}-${String(size.width)}`);
      }
      await context.close();
    }
  }
}

async function milestones(browser: Browser): Promise<void> {
  // M4: Website and Settings.
  const m4 = join(OUT, 'm4');
  // Give the photo tabs something to show.
  {
    const context = await newContext(browser, DESKTOP);
    const page = await context.newPage();
    await ownerSignIn(page);
    await page.goto(`${BASE}/admin/website?tab=photo`);
    await page.getByLabel(/Choose a (new )?photo/).setInputFiles({
      name: 'shop.png',
      mimeType: 'image/png',
      buffer: await samplePng(page, 'THE SHOP', '#2a2a2a'),
    });
    await page.getByLabel('Describe the photo (alt text)').fill('Inside the shop, chairs in a row');
    await page.getByRole('button', { name: /(Add|Replace) home photo/ }).click();
    await page.getByText(/Home photo replaced/).waitFor();
    await page.goto(`${BASE}/admin/website?tab=gallery`);
    await page.getByLabel('Add photos').setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: await samplePng(page, 'FADE', '#7a1f1f') },
      { name: 'b.png', mimeType: 'image/png', buffer: await samplePng(page, 'TAPER', '#1f4a7a') },
    ]);
    await page.getByLabel('Alt text for a.png').fill('A skin fade, finished');
    await page.getByLabel('Alt text for b.png').fill('A tapered cut from the side');
    await page.getByLabel('Credit the work to').first().selectOption({ label: 'Lee' });
    await page.getByRole('button', { name: 'Upload 2 photos' }).click();
    await page.getByText('2 photos added to the gallery.').waitFor();
    await context.close();
  }
  await ownerPages(
    browser,
    m4,
    [
      ['website-hours', '/admin/website?tab=hours'],
      ['website-announcement', '/admin/website?tab=announcement'],
      ['website-services', '/admin/website?tab=services'],
      ['website-photo', '/admin/website?tab=photo'],
      ['website-gallery', '/admin/website?tab=gallery'],
      ['settings-shop', '/admin/settings?tab=shop'],
      ['settings-rules', '/admin/settings?tab=rules'],
      ['settings-account', '/admin/settings?tab=account'],
      ['settings-email', '/admin/settings?tab=email'],
    ],
    ['light'],
  );
  await ownerPages(
    browser,
    m4,
    [
      ['website-services', '/admin/website?tab=services'],
      ['settings-shop', '/admin/settings?tab=shop'],
    ],
    ['dark'],
  );

  // M5: the barber portal and the owner's Access tab.
  const m5 = join(OUT, 'm5');
  for (const theme of ['light', 'dark'] as const) {
    const context = await newContext(browser, PHONE, theme);
    const page = await context.newPage();
    await resetLimits();
    await page.goto(`${BASE}/team`);
    await page.getByRole('heading', { name: 'Who is signing in?' }).waitFor();
    await shot(page, m5, `team-names-${theme}-390`);
    await page.getByRole('button', { name: theme === 'light' ? /^Drew/ : /^Nelly/ }).click();
    await shot(page, m5, `team-pin-${theme}-390`);
    await pin(page, DEMO_PIN);
    await page.getByRole('heading', { name: 'Today', level: 1 }).waitFor();
    await page.getByRole('button', { name: 'Walk-in' }).click();
    const sheet = page.getByRole('dialog', { name: 'Walk-in' });
    await sheet.getByLabel('Name').fill('Jordan Ellis');
    await sheet.getByLabel('Mobile phone').fill(randomPhone());
    await shot(page, m5, `team-walkin-${theme}-390`);
    await sheet.getByLabel(/^Haircut(?! and| with)/).check();
    await sheet.getByRole('button', { name: 'Start now' }).click();
    await page.getByText('Jordan Ellis is in your chair.').waitFor();
    await page.waitForTimeout(4500);
    await shot(page, m5, `team-today-${theme}-390`);
    await page.locator('.exq-team-row').first().click();
    await shot(page, m5, `team-booking-${theme}-390`);
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Week', exact: true }).click();
    await page.locator('.exq-team-day').first().waitFor();
    await shot(page, m5, `team-week-${theme}-390`);
    await page.getByRole('link', { name: 'Time off', exact: true }).click();
    await page.getByRole('heading', { name: 'Time off', level: 1 }).waitFor();
    await shot(page, m5, `team-timeoff-${theme}-390`);
    await page.getByRole('link', { name: 'Me', exact: true }).click();
    await page.getByRole('heading', { name: 'Me', level: 1 }).waitFor();
    await shot(page, m5, `team-me-${theme}-390`);
    await context.close();
  }
  for (const size of [DESKTOP, PHONE]) {
    const context = await newContext(browser, size);
    const page = await context.newPage();
    await ownerSignIn(page);
    await page.goto(`${BASE}/admin/team`);
    await page.getByRole('link', { name: 'Dontrise', exact: true }).click();
    await page.getByRole('tab', { name: 'Access' }).click();
    await page.getByRole('button', { name: 'Copy setup link' }).waitFor();
    await shot(page, m5, `team-access-light-${String(size.width)}`);
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

/** The shop and two chairs open all day, so "today" always has working time to lose. */
async function openAllDay(page: Page, on: boolean): Promise<void> {
  await page.evaluate(async (open) => {
    // tsx wraps named arrow functions with __name; the page has no such helper.
    (globalThis as unknown as { __name?: (f: unknown) => unknown }).__name ??= (f) => f;
    const day = open ? [{ start: '00:00', end: '23:45' }] : null;
    const send = async (path: string, body: unknown) => {
      const res = await fetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${path} ${String(res.status)}`);
    };
    const week = (intervals: { start: string; end: string }[] | null) => ({
      mon: intervals ?? [],
      tue: intervals ?? [{ start: '10:00', end: '19:00' }],
      wed: intervals ?? [{ start: '10:00', end: '19:00' }],
      thu: intervals ?? [{ start: '10:00', end: '19:00' }],
      fri: intervals ?? [{ start: '10:00', end: '19:00' }],
      sat: intervals ?? [{ start: '10:00', end: '19:00' }],
      sun: intervals ?? [{ start: '10:00', end: '19:00' }],
    });
    await send('/api/admin/hours', { days: week(day) });
    const staff = (await (await fetch('/api/admin/staff')).json()) as {
      staff: { id: string; name: string }[];
    };
    for (const member of staff.staff) {
      if (!['Lee', 'Drew', 'Nelly Cutz'].includes(member.name)) continue;
      await send(`/api/admin/staff/${member.id}/hours`, { days: week(day) });
    }
  }, on);
}

async function recordings(browser: Browser): Promise<void> {
  const dir = join(OUT, 'recordings');
  mkdirSync(dir, { recursive: true });

  // Prepare: all-day hours, and two of Lee's clients today (the first slots after the lead time).
  const prep = await newContext(browser, DESKTOP);
  const prepPage = await prep.newPage();
  await ownerSignIn(prepPage);
  await openAllDay(prepPage, true);
  const booker = await newContext(browser, DESKTOP);
  const bookerPage = await booker.newPage();
  await resetLimits();
  await book(bookerPage, 'lee', 'Terrence Wallace');
  await resetLimits();
  await book(bookerPage, 'lee', 'Jerome Patterson');
  await booker.close();
  await resetLimits();

  // 1. The barber: sign in, mark a client done, say "I am out today".
  const tmp = join(dir, 'tmp-barber');
  const phone = await newContext(browser, PHONE, 'light', tmp);
  const page = await phone.newPage();
  await page.goto(`${BASE}/team`);
  await page.getByRole('heading', { name: 'Who is signing in?' }).waitFor();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^Lee/ }).click();
  await page.waitForTimeout(700);
  for (const d of DEMO_PIN) {
    await page
      .getByRole('group', { name: /^PIN for/ })
      .getByRole('button', { name: d, exact: true })
      .click();
    await page.waitForTimeout(220);
  }
  await page.getByRole('heading', { name: 'Today', level: 1 }).waitFor();
  await page.waitForTimeout(1200);
  await page.locator('.exq-team-next').getByRole('button', { name: 'Done' }).click();
  await page.getByText(/is done\./).waitFor();
  await page.waitForTimeout(1800);
  await page.getByRole('link', { name: 'Time off', exact: true }).click();
  await page.getByRole('button', { name: 'I am out today', exact: true }).waitFor();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'I am out today', exact: true }).click();
  await page.waitForTimeout(1200);
  await page
    .getByRole('dialog', { name: 'Out today?' })
    .getByRole('button', { name: 'Yes, I am out today' })
    .click();
  await page.getByText(/The owner will handle your/).waitFor();
  await page.waitForTimeout(2500);
  await phone.close();
  moveVideo(tmp, join(dir, 'barber-flow.webm'));

  // 2. The owner: the alert on the overview, Decide, Move one client, keep none.
  const tmp2 = join(dir, 'tmp-owner');
  const desk = await newContext(browser, DESKTOP, 'light', tmp2);
  const owner = await desk.newPage();
  await ownerSignIn(owner);
  await owner.waitForTimeout(1500);
  const decide = owner.getByRole('button', { name: /Decide/ }).first();
  await decide.waitFor();
  await decide.click();
  const panel = owner.getByRole('dialog').first();
  await panel.locator('.exq-resolver__item').first().waitFor();
  await owner.waitForTimeout(1500);
  const items = panel.locator('.exq-resolver__item');
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    const move = items.nth(i).getByRole('radio', { name: /^Move/ });
    if (await move.isEnabled()) await move.check({ force: true });
    else await items.nth(i).getByRole('radio', { name: /^Keep/ }).check({ force: true });
    await owner.waitForTimeout(900);
  }
  await owner.waitForTimeout(900);
  await panel
    .getByRole('button', { name: /Apply|Save|Decide/ })
    .last()
    .click();
  await owner.waitForTimeout(2500);
  await desk.close();
  moveVideo(tmp2, join(dir, 'owner-resolves-alert.webm'));

  await openAllDay(prepPage, false).catch(() => undefined);
  await prep.close();
}

/** Playwright names videos with a hash; keep one stable file name per recording. */
function moveVideo(tmpDir: string, target: string): void {
  const file = readdirSync(tmpDir).find((f) => f.endsWith('.webm'));
  if (!file) throw new Error(`no video in ${tmpDir}`);
  renameSync(join(tmpDir, file), target);
  rmSync(tmpDir, { recursive: true, force: true });
  process.stdout.write(`${target}\n`);
}

// ---------------------------------------------------------------------------
// Guide screens and the milestone 6 shots
// ---------------------------------------------------------------------------

/** One guide step. A step that cannot run is logged and skipped so one change does not lose the set. */
async function step(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    process.stdout.write(
      `SKIPPED ${label}: ${String(error).split('\n')[0]?.slice(0, 200) ?? ''}\n`,
    );
  }
}

async function guide(browser: Browser): Promise<void> {
  const dir = join(OUT, 'guide');
  mkdirSync(dir, { recursive: true });

  // The hours screen first, while the hours are still the shop's own (the prep below opens them all day).
  {
    const context = await newContext(browser, DESKTOP);
    const page = await context.newPage();
    await ownerSignIn(page);
    await page.goto(`${BASE}/admin/website?tab=hours`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await shot(page, dir, 'o17-website-hours');
    await context.close();
  }

  // Working time and clients for today, then Lee says he is out so there is an alert to show.
  const prep = await newContext(browser, DESKTOP);
  const prepPage = await prep.newPage();
  await ownerSignIn(prepPage);
  await openAllDay(prepPage, true);
  const booker = await newContext(browser, DESKTOP);
  const bookerPage = await booker.newPage();
  for (const [barber, name] of [
    ['lee', 'Terrence Wallace'],
    ['lee', 'Jerome Patterson'],
    ['drew', 'Imani Brooks'],
    ['nelly', 'Darnell Hughes'],
  ] as [string, string][]) {
    await book(bookerPage, barber, name);
  }
  await booker.close();

  // Barber screens, 390 wide.
  const phone = await newContext(browser, PHONE);
  const bp = await phone.newPage();
  await bp.goto(`${BASE}/team`);
  await bp.getByRole('heading', { name: 'Who is signing in?' }).waitFor();
  await shot(bp, dir, 'b01-names');
  await bp.getByRole('button', { name: /^Lee/ }).click();
  await shot(bp, dir, 'b02-pin');
  await pin(bp, DEMO_PIN);
  await bp.getByRole('heading', { name: 'Today', level: 1 }).waitFor();
  await shot(bp, dir, 'b03-today');
  await step('b04', async () => {
    await bp.locator('.exq-team-row').first().click();
    await shot(bp, dir, 'b04-booking');
    await bp.keyboard.press('Escape');
  });
  await step('b05', async () => {
    await bp.getByRole('button', { name: 'Walk-in' }).click();
    const sheet = bp.getByRole('dialog', { name: 'Walk-in' });
    await sheet.getByLabel('Name').fill('Jordan Ellis');
    await sheet.getByLabel('Mobile phone').fill(randomPhone());
    await sheet.getByLabel(/^Haircut(?! and| with)/).check();
    await shot(bp, dir, 'b05-walk-in');
    await bp.keyboard.press('Escape');
  });
  await step('b06', async () => {
    await bp.getByRole('link', { name: 'Week', exact: true }).click();
    await bp.locator('.exq-team-day').first().waitFor();
    await shot(bp, dir, 'b06-week');
  });
  await step('b07', async () => {
    await bp.getByRole('link', { name: 'Time off', exact: true }).click();
    await bp.getByRole('button', { name: 'I am out today', exact: true }).waitFor();
    await shot(bp, dir, 'b07-time-off');
    await bp.getByRole('button', { name: 'I am out today', exact: true }).click();
    await shot(bp, dir, 'b08-out-today-confirm');
    await bp
      .getByRole('dialog', { name: 'Out today?' })
      .getByRole('button', { name: 'Yes, I am out today' })
      .click();
    await bp.getByText(/The owner will handle your/).waitFor();
    await shot(bp, dir, 'b09-out-today-sent');
  });
  await step('b10', async () => {
    await bp.getByRole('link', { name: 'Me', exact: true }).click();
    await bp.getByRole('heading', { name: 'Me', level: 1 }).waitFor();
    await shot(bp, dir, 'b10-me');
  });
  await phone.close();

  // Owner screens at 1280, then a few at 390.
  const desk = await newContext(browser, DESKTOP);
  const page = await desk.newPage();
  await page.goto(`${BASE}/admin/login`);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await shot(page, dir, 'o01-sign-in');
  await page.getByRole('button', { name: 'Enter demo dashboard' }).click();
  await page.waitForURL(/\/admin(?!\/login)/);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await shot(page, dir, 'o02-overview');
  await step('o03', async () => {
    const box = page.getByRole('combobox', { name: 'Search bookings and customers' });
    await box.fill('Terrence');
    await page.getByRole('listbox').getByRole('option').first().waitFor();
    await shot(page, dir, 'o03-search');
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByRole('dialog', { name: 'Booking' }).waitFor();
    await shot(page, dir, 'o07-booking-sheet');
    await page.keyboard.press('Escape');
  });
  await step('o04', async () => {
    await page.locator('.exq-topbar').getByRole('button', { name: 'New booking' }).click();
    await page.getByRole('dialog', { name: 'New booking' }).waitFor();
    await shot(page, dir, 'o04-new-booking');
    await page.keyboard.press('Escape');
  });
  await step('o05', async () => {
    await page
      .getByRole('group', { name: 'Quick actions' })
      .getByRole('button', { name: 'Walk-in' })
      .click();
    await page.getByRole('dialog', { name: 'New booking' }).waitFor();
    await shot(page, dir, 'o05-walk-in');
    await page.keyboard.press('Escape');
  });
  await step('o06', async () => {
    await page.goto(`${BASE}/admin/bookings`);
    await page.locator('table.exq-table').waitFor();
    await shot(page, dir, 'o06-bookings-table');
  });
  await step('o08', async () => {
    await page.goto(`${BASE}/admin/schedule`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await shot(page, dir, 'o08-schedule-day');
    await page.goto(`${BASE}/admin/schedule?view=week`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await shot(page, dir, 'o09-schedule-week');
  });
  await step('o10', async () => {
    await page.goto(`${BASE}/admin`);
    await page
      .getByRole('group', { name: 'Quick actions' })
      .getByRole('button', { name: /Block/ })
      .click();
    await page.getByRole('dialog').first().waitFor();
    await shot(page, dir, 'o10-block-time');
    await page.keyboard.press('Escape');
  });
  await step('o11', async () => {
    await page.goto(`${BASE}/admin`);
    await page.getByRole('region', { name: 'Needs a decision' }).waitFor();
    await shot(page, dir, 'o11-alert');
    await page
      .getByRole('button', { name: /Decide/ })
      .first()
      .click();
    await page.getByRole('dialog').first().locator('.exq-resolver__item').first().waitFor();
    await shot(page, dir, 'o12-resolver');
    await page.keyboard.press('Escape');
  });
  await step('o13', async () => {
    await page.goto(`${BASE}/admin/customers`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await shot(page, dir, 'o13-customers');
    await page.locator('table.exq-table tbody tr').first().click();
    await page.getByRole('dialog').first().waitFor();
    await shot(page, dir, 'o14-customer-sheet');
    await page.keyboard.press('Escape');
  });
  await step('o15', async () => {
    await page.goto(`${BASE}/admin/team`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await shot(page, dir, 'o15-team');
    await page.getByRole('link', { name: 'Dontrise', exact: true }).click();
    await page.getByRole('tab', { name: 'Access' }).click();
    await page.getByRole('button', { name: 'Copy setup link' }).waitFor();
    await shot(page, dir, 'o16-team-access');
  });
  for (const tab of ['announcement', 'services', 'photo', 'gallery']) {
    await step(`website ${tab}`, async () => {
      await page.goto(`${BASE}/admin/website?tab=${tab}`);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await shot(page, dir, `o17-website-${tab}`);
    });
  }
  for (const tab of ['shop', 'rules', 'account', 'email']) {
    await step(`settings ${tab}`, async () => {
      await page.goto(`${BASE}/admin/settings?tab=${tab}`);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await shot(page, dir, `o18-settings-${tab}`);
    });
  }
  await desk.close();

  const small = await newContext(browser, PHONE);
  const sp = await small.newPage();
  await ownerSignIn(sp);
  await shot(sp, dir, 'o02-overview-390');
  await step('o06 phone', async () => {
    await sp.goto(`${BASE}/admin/bookings`);
    await sp.getByRole('heading', { level: 1 }).first().waitFor();
    await shot(sp, dir, 'o06-bookings-390');
  });
  await small.close();

  // Restoring the hours can be refused while the day's bookings sit outside them; the server is thrown away.
  await openAllDay(prepPage, false).catch(() => undefined);
  await prep.close();
}

/** Milestone 6: the demo notice, footer social links, the header at phone widths, the outage fallback. */
async function m6(browser: Browser): Promise<void> {
  const dir = join(OUT, 'm6');
  mkdirSync(dir, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    const context = await newContext(browser, PHONE, theme, undefined, true);
    const page = await context.newPage();
    await page.goto(`${BASE}/`);
    await page.getByRole('dialog', { name: 'This is a demo' }).waitFor();
    await shot(page, dir, `demo-notice-${theme}-390`);
    await page.getByRole('button', { name: 'Enter the demo' }).click();
    await page.waitForTimeout(400);
    await shot(page, dir, `home-${theme}-390`);
    await page.locator('footer.exq-footer').scrollIntoViewIfNeeded();
    await shot(page, dir, `footer-${theme}-390`);
    await context.close();
  }
  for (const width of [360, 390]) {
    const context = await newContext(browser, { width, height: 780 });
    const page = await context.newPage();
    await page.goto(`${BASE}/`);
    await page.locator('.exq-nav__toggle').waitFor();
    await page.screenshot({
      path: join(dir, `header-${String(width)}.png`),
      clip: { x: 0, y: 0, width, height: 90 },
    });
    await context.close();
  }
  {
    const context = await newContext(browser, DESKTOP, 'light', undefined, true);
    const page = await context.newPage();
    await page.goto(`${BASE}/`);
    await page.getByRole('dialog', { name: 'This is a demo' }).waitFor();
    await shot(page, dir, 'demo-notice-light-1280');
    await page.getByRole('button', { name: 'Enter the demo' }).click();
    await page.waitForTimeout(300);
    await page.locator('footer.exq-footer').scrollIntoViewIfNeeded();
    await shot(page, dir, 'footer-light-1280');
    await context.close();
  }
  {
    const context = await newContext(browser, PHONE);
    const page = await context.newPage();
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'DATABASE_UNAVAILABLE', message: 'Down', requestId: 'stub' },
          }),
        }),
    );
    await page.goto(`${BASE}/`);
    await page.locator('.exq-outage').waitFor({ timeout: 15_000 });
    await shot(page, dir, 'outage-home-light-390', true);
    await context.close();
  }
  // Owner pages with the new icons.
  await ownerPages(browser, dir, [['overview', '/admin']], ['light', 'dark']);
}

// ---------------------------------------------------------------------------

function montage(dir: string, pattern: RegExp, name: string, tile: string): void {
  const files = readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort()
    .map((f) => join(dir, f));
  if (files.length === 0) return;
  execFileSync('montage', [
    ...files,
    '-tile',
    `${String(Math.min(files.length, tile.startsWith('390') ? 5 : 3))}x`,
    '-geometry',
    `${tile}+10+10`,
    '-gravity',
    'North',
    '-background',
    '#D9D9D9',
    join(dir, name),
  ]);
  process.stdout.write(`${join(dir, name)}\n`);
}

/** The demo database outlives the server, so every run starts from the seed data. */
async function resetDemoData(browser: Browser): Promise<void> {
  const context = await newContext(browser, DESKTOP);
  const page = await context.newPage();
  await ownerSignIn(page);
  const status = await page.evaluate(async () => {
    const res = await fetch('/api/admin/demo/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return res.status;
  });
  if (status !== 200) throw new Error(`demo reset answered ${String(status)}`);
  await context.close();
}

async function main(): Promise<void> {
  const browser = await launch();
  try {
    await resetDemoData(browser);
    await resetLimits();
    if (mode === 'milestones') {
      await milestones(browser);
      for (const m of ['m4', 'm5']) {
        const dir = join(OUT, m);
        montage(dir, /-light-1280\.png$/, 'montage-light-1280.png', '640x700');
        montage(dir, /-light-390\.png$/, 'montage-light-390.png', '390x844');
        montage(dir, /-dark-390\.png$/, 'montage-dark-390.png', '390x844');
      }
    } else if (mode === 'guide') {
      await guide(browser);
    } else if (mode === 'm6') {
      await m6(browser);
      const dir = join(OUT, 'm6');
      montage(dir, /-390\.png$/, 'montage-390.png', '390x844');
    } else if (mode === 'recordings') {
      await recordings(browser);
    } else {
      throw new Error(`unknown mode ${mode}`);
    }
  } finally {
    await browser.close();
  }
}

void main();
