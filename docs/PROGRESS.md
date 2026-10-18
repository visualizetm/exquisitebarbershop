# Progress

One block per milestone, newest at the bottom. Each names what shipped, the
commit, and what is still open.

## Prompt 4

### Milestone 1: living docs, tokens, fonts, kit

- Shipped: `docs/SITE-REPORT.md`, `docs/DESIGN-SYSTEM.md`, this file and
  `docs/DECISIONS.md`; `src/styles/tokens.css`, `base.css`, `kit.css`; Jost
  self-hosted; the kit in `src/components/ui` (Button, Input, Select, Textarea,
  Chip, Card, Sheet, Toast, EmptyState, ErrorState, Nav, Footer, StepBar,
  StickyCTA, PhotoArch, ChairCard, TimeChip, Ticket, Lightbox); placeholder
  brand marks in `public/brand/`; the dev-only `/kit` page; the screenshot
  script. The public layout now uses the kit Nav and Footer.
- Screens: `docs/screens/m1/` (kit and home at 390 and 1280, plus montages).
- Open: every page still has its prompt 1 to 3 markup; the design pass on them
  is milestones 3 and 4.

### Milestone 2: storage, photos, next opening

- Shipped: the storage port with `r2` (aws4fetch) and `local` drivers; the
  `photos` collection with its two indexes; upload-url, confirm, list, PATCH and
  DELETE for photos with owner and barber scopes; purge in the daily cron;
  staff photos on `/api/staff`, the hero on `/api/shop`, `GET /api/gallery`;
  `GET /api/availability/next`, `GET /api/staff/:slug/openings`, `count` on
  the days endpoint; `/book` lands on details for a time from a link and steps
  back with a notice when it is gone. New settings: `permissions.barbersCanUploadPhotos`
  and `nextOpenServiceId`.
- Tests: photos (limits, server keys, confirm mismatches, signed PUT, local
  driver end to end, gallery paging, barber scope), next opening (status, owner
  service, off and closed days, openings, days count), a unit test for the
  label, and the authorization matrix at 71 routes x 4 roles.
- Open: the Photos screen and the browser-side resize to WebP are milestone 4.

### Milestone 3: public pages

- Shipped: Home (hero with the R2 photo or the ink band, today's chairs strip
  from `/api/availability/next`, services preview with group chips, the work
  grid with the Lightbox, visit with today highlighted, the ink band), Services,
  The chairs (grid in chair order), the profile (arch photo, badge, next
  openings as TimeChips into /book with date and time, services, work strip,
  Instagram, sticky Book on phones, alias redirect), Gallery (per chair chips
  with counts, lazy grid with dimensions, Lightbox, load more), Visit (hours,
  address, Directions, Call, policies, parking placeholder) and Not found.
  Shared pieces in `src/components/site/`; layout in `src/styles/pages.css`.
- Tests: e2e for the home strip linking to /book?barber, the profile chip
  landing on details with the time selected, and the gallery lightbox after a
  real upload from the browser. A prompt 3 test that booked ten hours ahead was
  pinned to tomorrow so it never spills past midnight.
- Screens: `docs/screens/m3/` (home, services, chairs, a profile, gallery,
  visit at 390 and 1280 with sample photos, plus montages).
- Open: Book, Manage and the dashboard keep their prompt 2 and 3 markup until
  milestone 4.

### Milestone 4: Book, Manage, the dashboard and Photos

- Shipped: Book with a StepBar, selectable service rows, chair cards with a
  first-available card, day chips with counts and reasons, times grouped into
  morning, afternoon and evening, the details form with tel and email types, a
  sticky total bar on phones that hides while typing, a Ticket on confirmation
  and fresh times inline with a Toast on a 409. Manage with the same Ticket,
  reschedule reusing the pickers, and cancel as a confirm Sheet. The dashboard
  with a bottom tab bar (Today, Schedule, New, More) and a side nav from 1024px,
  Today as one card per chair with Now, Next and a status switch with Undo, a
  New online bookings chip, the new booking form as a Sheet, block time as a
  Sheet on the schedule, the conflict resolver as a list with chip choices,
  services and staff as lists with edit Sheets, a Photos screen (Hero, Chairs,
  Gallery) with resize to 2000px WebP in the browser, upload progress, required
  alt text, up and down reordering and removal, and a photo picker on each
  staff member. Dark mode follows the system in the admin.
- Tests: e2e for the owner uploading a chair photo through the Photos screen
  with the local driver; the existing booking, admin and site flows pass on the
  restyled screens.
- Screens: `docs/screens/m4/` (book, book with a chair, admin today, schedule,
  photos, services at 390 and 1280, plus montages).
- Open: SEO, icons, the OG image, JSON-LD, the sitemap and Lighthouse are
  milestone 5.

### Milestone 5: SEO, icons, OG, JSON-LD, sitemap, Lighthouse

- Shipped: per-route title, description, canonical, Open Graph and robots meta
  from shop data (`usePageMeta`); the 1200x630 OG image, favicons, apple touch
  icon, maskable icon and web manifest rendered from the brand marks by
  `scripts/brand-assets.ts`; JSON-LD BarberShop built from `/api/shop` with
  `openingHoursSpecification`; `/sitemap.xml` served by the API from the live
  chair list; robots.txt kept; one `/api/shop` fetch shared through a context;
  Jost preloaded by a Vite plugin and a minimum main height to remove layout
  shift.
- Lighthouse mobile (production build, simulated throttling): Home 97 / 100 /
  100 / 100, profile 96 / 100 / 100 / 100, Book 97 / 100 / 100 / 100
  (performance, accessibility, best practices, SEO), CLS 0 on all three.
- Tests: sitemap integration test, JSON-LD unit test, an e2e check of the
  profile meta, JSON-LD and sitemap; the authorization matrix is 72 routes by
  4 roles.
- Screens: `docs/screens/m5/` (every public page, Manage, admin Today and
  Photos at 390 and 1280, plus montages).
- Open: the real brand SVGs, the domain (for the robots Sitemap line and the OG
  URL), the real phone and hours, and a check on a real iPhone.

## Prompt 5

### Milestone 1: report 04 carryover fixes and brand assets

- Shipped: a photo confirm that deletes a mismatched or oversized object before
  answering; a `pendingUploads` record per issued URL and a daily sweep of
  uploads older than an hour (`uploadsSwept` in the cron summary);
  `R2_KEY_PREFIX` for previews sharing a bucket; the robots Sitemap line from
  APP_BASE_URL at build time; a login lockout bypass for addresses that signed
  in to the account within 30 days (keyed hashes, at most ten, the lock stays
  for everyone else); the real brand marks rendered into the icons and OG image.
- Tests: sweep, mismatch cleanup, key prefix end to end, lockout bypass with the
  attacker still locked, the ten address cap and the 30 day expiry.

### Milestone 2: three themes everywhere

- Shipped: System, Light and Dark on the public site and the admin, stored
  under `exq-theme`, applied as `data-theme` on `<html>` by an inline script
  before the first paint (its sha256 is in the CSP); dark values in tokens.css
  under the attribute and the media query; `theme-color` live; `ThemeMenu` in
  the Nav and `ThemeSwitch` in the mobile menu and the admin Account page;
  `Mark` swaps the black and white marks with CSS; ink bands get a #1A1A1A
  surface and a #2E2E2E top border in dark; selected states invert.
- Tests: persistence across reloads, System following an emulated scheme, the
  first paint carrying the stored theme, the keyboard flow, axe in both themes
  on Home, Book, admin Today and Account, and the CSP hash unit test.
- Screens: `docs/screens/theme/` (Home, a profile, Book, Manage, admin Today and
  Photos at 390 and 1280 in light and dark; `montage-light-*` and
  `montage-dark-*`).

### Milestone 3: Book on desktop

- Shipped: two columns at 1024px and up with the H1 "Book your chair", the
  sub line, the StepBar and the steps on the left (services in two columns of
  selectable cards, "Anyone available" first among the chairs, the day strip,
  grouped times, details) and a sticky ink summary card on the right (the
  wordmark, "Your booking" in red, each service with its price, With, When,
  the total, the Confirm button disabled until the review step, and "Pay in
  the chair. Free to cancel up to 2 hours before." from the shop setting).
  Under 1024px nothing changed except the heading text.
- Tests: the card shows the choices, is disabled before the details, is hidden
  on a phone where the StickyCTA shows the total, and submits the booking on a
  wide screen.
- Screens: `docs/screens/p5-m3/` (Book at 390 and 1280, light and dark).

### Milestone 4: environment, doctor, bootstrap, setup page, smoke test

- Shipped: one env schema with per-environment rules (development, test,
  preview, production) and a router gate that answers 503 CONFIG_ERROR until
  the environment is complete; GET /api/internal/doctor and `npm run doctor`
  (settings, database, replica set, transactions, indexes, seed, storage round
  trip, public URL, email provider and Resend domain status, cron secret, each
  with a fix written for a non-developer); POST /api/internal/bootstrap behind
  BOOTSTRAP_SECRET (indexes, seed, owner login, once, force to repeat,
  audited); the /setup page (noindex, 404 while the secret is unset);
  `npm run smoke -- --url=` and the manual Smoke test Action; MAINTENANCE_MODE
  on the API (the public pages follow in milestone 5).
- Tests: env rules (unit), the doctor on a healthy test deployment and on a
  production deployment with missing settings, bootstrap once and forced, 404
  while off, maintenance mode on the API, the setup page end to end; the
  authorization matrix is 75 routes by 4 roles.

### Milestone 5: backups, the daily cron, logs, maintenance

- Shipped: `runBackup` and `pruneBackups` (gzipped canonical EJSON per business
  collection under `_backups/YYYY-MM-DD/`, 30 days kept), `npm run restore`
  into another database (live name refused without `--force`), the combined
  `/api/internal/cron/daily` route wired in vercel.json with a 60 second
  function limit, PII scrubbing in the logger, the `SiteDown` state for an
  unreachable API and for MAINTENANCE_MODE with the shop phone and a tel button.
- Tests: backup and restore round trip on the in-memory replica set (exact
  documents, Dates intact), pruning, the daily route, PII masking, the
  maintenance flag on `/api/shop`.
- Screens: `docs/screens/p5-m5/` (the API-down and maintenance states at 390).

### Milestone 6: merge path and docs

- Shipped: `docs/DEPLOY.md` (secrets, the Vercel variable table by environment,
  Atlas, merging the pull request, /setup, the domain, Resend, removing the
  setup variables, the launch checklist), `docs/OPERATIONS.md` (backups and
  restore, rotating each secret and what breaks, password resets, maintenance
  mode, logs, what to do if bookings stop), the living docs, the pull request
  into `main` and `docs/reports/05-go-live.md`.

## Prompt 6

### Milestone 1: audit

- `docs/screens/audit/` with every page and Book step at 390 and 1280 in light
  and dark, four montages and `facts.json` (`tests/e2e/audit.ts`);
  `docs/reports/06-audit-findings.md` with the page facts, the 14-category
  scorecard (22 of 28 before fixes), the flows walked, and the security review
  re-derived from the routes, the bundle, the history, the cookie, ten reruns
  of each race and the restore drill.

### Milestone 2: fixes with regression tests

- Failure-only login counters (per address and per email); the e2e reset hook
  called once per Playwright run; the sticky bar no longer hides on a checkbox
  or radio; one Confirm per screen; no raw manage URL on the done screen; the
  phone hero keeps its ratio (Home CLS 0); the idempotency test pinned to an
  open slot; the selected chip count at full contrast.

### Milestone 3: small fixes and recaptures

- 44px tap targets for small buttons, admin buttons and inline text links; the
  Today chair list keeps its height while loading; audit captures and facts
  retaken (no clickable under 44px remains).

### Milestone 4: handoff

- `docs/OWNER-GUIDE.md` and `.pdf`, `docs/BARBER-GUIDE.md` with phone
  screenshots in `docs/guide/`; the living docs; the pull request;
  `docs/reports/06-final.md`.

## Prompt 7

### Live without R2, visible failures, three UI fixes, a production-like run

- Shipped: STORAGE_DRIVER=none with STORAGE_DISABLED_ACK in production (upload
  routes answer 503 STORAGE_DISABLED, every photo read is empty so the pages
  show their placeholders, the Photos screen shows one empty state, the daily
  job skips the storage steps and says so, the doctor warns with the R2 fix);
  `/api/health` answers `{ ok: false, missing: [...] }` while the gate refuses
  to serve, and does so even when MONGODB_URI itself is missing; `/setup` loads
  in that state; the nav shows the wordmark from 1024px and the stacked mark
  below, the admin side nav the stacked mark; the API-down body reads "Call the
  shop and we'll get you in."; route changes focus the page H1 without a ring;
  `npm run test:e2e:prod` builds and serves the production bundle over https
  with the Vercel headers and the launch variable set, plus a twin without
  MONGODB_URI; `docs/screens/p7/` with one combined montage; DEPLOY.md with the
  no-R2 table, the order of clicks and the R2-later section.
- Also fixed on the way: a missing shop settings document answered 500 (now the
  same 503 CONFIG_ERROR as the gate); short admin pages on phones sat below the
  fold; the active nav underline never showed; the sign-in page probed the
  session without a cookie and logged a 401.
- Open: Rob sets the variables, redeploys, runs /setup, removes the setup
  variables and redeploys; R2 and Resend later.

## Prompt 8

### Showcase demo

- Shipped: `DEMO_MODE=true` (auto setup on the first request with a lock document, reusing
  `bootstrap()`; owner, five barbers, services, hours and eleven sample bookings and walk-ins
  with fictional names and 555-01XX phones); the "Enter demo dashboard" button and the demo
  banner; Settings, Demo data, Reset demo data; `STORAGE_DRIVER=mongo` (GridFS) with
  `GET` and `PUT /api/media/:id`, a 3 MB cap and the browser fallback resize; noindex in the
  build, at runtime and as an API header; the manage link on the done screen; the Details
  disclosure on the down screen; Clear demo data on /setup and `npm run demo:clear`; DEPLOY.md
  section 11; the showcase production-like run (`npm run test:e2e:demo`) and `docs/screens/p8/`.
- Also fixed: the Home hero overlapped its own logo on phones; the admin sign-in page had no
  logo; the hero logo had the wrong aspect ratio.
- Open: Rob sets DEMO_MODE=true and STORAGE_DRIVER=mongo, merges, redeploys. Before real
  customers: leave demo mode (DEPLOY.md section 11), real contact details, hours, prices,
  R2 and email.
