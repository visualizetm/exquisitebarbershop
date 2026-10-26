REPORT 13B: ARCHIVO EVERYWHERE, DARK DASHBOARD SHELL, THE FLOOR

Summary: Archivo replaces Jost on the site, booking, manage, dashboard, portal, kit, emails (as a stack), the brand PDF and og.png, from one preloaded variable file carrying both the weight and width axes. The owner dashboard is dark only with no side menu: one top bar (white stacked logo, a Shop | Website switch remembered per device, search, the shop clock, red New booking, an account menu) and a row of section tabs; routes moved to /admin/shop/* and /admin/website/:tab and every old address redirects with its path and query. Shop, Today is the floor: one card per chair (in chair, free, off today, Instagram), Coming up with one-tap Arrived, Start, Move and No show, Today so far and Done today, refreshed every 30 seconds while visible. Bookings carry arrivedAt and startedAt, stamped by two idempotent, audited owner routes. The old alerts strip, quick actions, week chart and latest events stay under the floor.

Built:

- M1 fonts: package.json (@fontsource-variable/archivo, Jost removed), src/main.tsx, vite.config.ts (preload), src/styles/tokens.css (--font, --w-display, --w-head, --w-label), base.css, kit.css, dashboard.css, frame.css, pages.css, team.css, admin.css (labels 700, headings 800, display 900), scripts/brand-assets.ts, scripts/guide-pdf.ts, public/og.png, docs/OWNER-GUIDE.pdf, server/notifications/templates/index.ts, docs/DESIGN-SYSTEM.md, docs/brand/BRAND.md
- M2 shell: src/admin/shell/AdminShell.tsx, src/admin/shell/ownerNav.tsx, src/admin/AdminApp.tsx (routes and Moved redirects), src/admin/website/WebsitePage.tsx, src/styles/tokens.css (--adm-* and the admin dark scope, --r-tile), src/styles/dashboard.css (top bar, section tabs, account menu, red primary), src/admin/settings/SettingsPage.tsx (Appearance removed), src/components/ui/Sidebar.tsx deleted
- M3 floor: shared/schemas/booking.ts, shared/api/admin.ts (view fields, floor schemas), shared/lib/floor.ts, server/repos/bookingsRepo.ts (stampBookingMoment), server/services/adminBookings.ts, server/services/floor.ts, server/http/routes/admin.ts, server/bundle/app.mjs, src/admin/today/TodayPage.tsx, src/admin/today/useFloor.ts, src/admin/overview/OverviewPage.tsx deleted
- Tests: tests/unit/floor.test.ts, tests/integration/adminApi.test.ts (arrived and start), authz.test.ts, tests/e2e/floor.spec.ts (1180), dashboard.spec.ts and website.spec.ts rewritten, theme, admin, site, photos, team, portal, demo and prod-like specs on the new paths, availabilityRoutes.test.ts de-flaked
- Docs and screens: docs/DECISIONS.md D13b-01 to D13b-13, docs/PROGRESS.md, docs/ARCHITECTURE.md (three API rows), .prettierignore (docs/design), docs/screens/p13b/ (home, services, chair-drew at 390 and 1280 light; today at 390, 1180, 1440; bookings at 1280; montage.png; lighthouse.json)

Key decisions: fontsource wdth.css over self-hosting, it already ships both axes (D13b-01); width tokens 122/116/114% and heavier labels, prices and headings (D13b-02); buttons wrap a long label instead of pushing the page sideways (D13b-03); dashboard dark only through one scoped override of the semantic surfaces, no per-component rules, red primary buttons, 16px cards (D13b-06); account menu is a button with a small menu, a native details element was dropped because summary has no button role (D13b-07); old addresses redirect with path remainder and query kept, Website reads its section from the path (D13b-08); floor rules pure and shared, in chair by Start or by the booked window, a late start ends late, Instagram only unless booked in the system (D13b-10); stamps idempotent at the repo filter, one audit entry per real stamp, 409 for finished or cancelled (D13b-11); Today keeps alerts, quick actions, chart and activity under the floor; no websockets, 30 second refresh keeping the last data (D13b-12).

Deviations: /admin lands on the side this device used last (Shop, Today until the owner switches), not always on Shop. Move opens the booking sheet (its move already reprices) rather than a separate panel. The Website page heading is the section name under a "Website" kicker. The owner guide still describes the old menu; it is rewritten with 13d. The Lighthouse target was missed by one point on the second run (see checklist).

Data model: bookings gains optional nullable arrivedAt and startedAt (UTC Date); no new collections or indexes. All other collections unchanged.

API contract: GET /api/admin/floor (owner); POST /api/admin/bookings/:id/arrived (owner); POST /api/admin/bookings/:id/start (owner); everything else unchanged. Audit actions added: booking.arrived, booking.start.

Tests:

- Vitest 87 files, 650 passed, 0 failed (after the weekday de-flake; the gate run had 1 failed of 650); coverage statements 96.64%, branches 88.82%, functions 97.85%, lines 96.64%
- Playwright dev suite in the gate: 144 passed, 4 failed, 1 skipped; the 4 (team and theme on old paths, portal blocked by the floor spec's booking on Lee's chair) fixed and rerun with floor.spec: 22 passed, 1 skipped. Prod-like: 1 failed in the gate (/admin now lands on the remembered side), fixed and rerun 7 of 7. Showcase: 12 of 13 in the gate (reset lands on /admin/shop/today), fixed and rerun 1 of 1. test:vercel-function 97 passed
- Commands: /tmp/gate.sh (build, typecheck, lint, format:check, test:coverage, dev, prod-like and showcase Playwright, test:vercel-function); npm run test:coverage; npx playwright test tests/e2e/floor.spec.ts tests/e2e/portal.spec.ts tests/e2e/team.spec.ts tests/e2e/theme.spec.ts; PRODLIKE_SKIP_BUILD=1 npx playwright test -c playwright.prod.config.ts; PRODLIKE_SKIP_BUILD=1 npx playwright test -c playwright.demo.config.ts -g "Reset demo data"

Checks: typecheck clean, lint clean, format clean (docs/design mockups ignored, two docs formatted), build clean.

Checklist:

- PASS no "Jost" left in src, server, scripts, shared, seed, tests, public or the emails and PDF (the logo files are fixed outlines); Archivo with both axes from one preloaded file (dist/index.html preloads archivo-latin-wdth-normal, 90 KB)
- PASS hero contrast with Archivo over the text boxes: 390 red 5.07:1 white 10.59:1; 768 red 4.89:1 white 8.88:1; 1280 on ink red 6.07:1 white 18.88:1
- PASS no sideways scroll on 10 public pages at 360, 390 and 414 (scroll.spec); dashboard at 390 scrollWidth 390 (dashboard.spec)
- PASS no side nav; the switch moves sides and is remembered (localStorage exq-admin-side); six old addresses redirect in dashboard.spec; every admin screen is dark (screens: today, bookings; settings and website checked by hand in the dev build)
- PASS floor states (6 unit tests, frozen clock); Arrived, Start and Done from Today at 1180 (floor.spec); No show and Move on Today call the existing status route and open the booking sheet, which their own specs cover; they are not tapped from Today in a test
- PASS tap targets 44px on the switch, tabs, New booking, account menu, floor buttons; axe clean on Today, Bookings and the booking panel at 390 and 1280, the shell with the menu open, six Website sections and four Settings tabs at 390 and 1280, Home and Book in light and dark
- FAIL Lighthouse mobile Home: run 1 performance 79 (TBT 320 ms, taken right after the gate), run 2 84 (FCP 2.0 s, LCP 4.1 s, TBT 140 ms, CLS 0.002), against 13a's 88 (LCP 3.5 s, CLS 0); accessibility 100, best practices 96, SEO 63 (demo build is noindex, same as 13a). Cause: the preloaded font is 91 KB against Jost's 27 KB, which delays text paint on the simulated phone. Repro: /tmp/claude-0/.../scratchpad/lh13b.sh on the demo build. Proposed fix, not done: instance the width axis to 100 to 125% with fonttools (the site uses nothing narrower), about 40% smaller, then re-measure

Commits: cdaf499 Archivo everywhere; bfa8f67 dark dashboard shell; 57bda81 the floor; 9050839 design system notes; 0957576 prettierignore; 06493cf docs format; d09218c availability de-flake; 55d8032 team, theme and floor specs; 4ce4526 demo and prod-like specs; SHIP commit with screens and this report follows.

Env vars: none new.

Open questions: Rob to confirm the dashboard-only dark look and the phone placement of the Shop | Website switch (in the tabs row, not the top bar); whether the week chart and recent activity should stay on Today or move to Bookings.

Known gaps and risks: Lighthouse Home 84 (target 85, 13a 88) from the heavier font; the floor's 30 second refresh and the progress bar are untested on a real tablet; the Check in slot is an empty span until 13c; the owner guide and its screenshots show the old menu; the barber portal is untouched (13d); the demo seed has no bookings for today on a Monday, so the Today screens show every chair off.

Milestone times: M1 about 35 minutes (to 22:27 UTC), M2 25 minutes (22:27 to 22:52), M3 13 minutes (22:52 to 23:05), SHIP from 23:05 (gate 20 minutes, five spec fixes, captures, Lighthouse, report).

Needs Rob's phone and tablet: the dashboard at 390 (switch and tabs scrolling sideways, the account menu), Today on the shop tablet at 1180 through a real cut (Arrived, Start, the bar filling, Done), and Archivo on the Home hero on a real iPhone.

Ready for next step: 13c (full-screen New booking, the walk-in line panel in the right column, tablet check-in in the top bar slot) starts from AdminShell.tsx and TodayPage.tsx. Do not touch the pricing rule, the reviews writer, the seed photo ids, the carousel snap rules, the reveal tokens or the slot locks; do not change the floor rules without a frozen-clock test.

Production: PR 11 merged into main as b5769d2 at 23:41 UTC with both CI runs and the Vercel preview green. Vercel's status on the merge commit reads "Deployment has completed" (success) at 23:42 UTC. The health URL is not reachable from this sandbox, so Rob checks /api/health once for buildSha b5769d2.

b5769d2, production: ready
