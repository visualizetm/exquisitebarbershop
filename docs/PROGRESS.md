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

## Prompt 9

### The function never loaded on Vercel

- Root cause: Vercel runs the compiled function with plain Node ESM, where the extensionless
  relative imports of `api/[...path].ts` do not resolve (ERR_MODULE_NOT_FOUND), so the API had
  never run in production.
- Shipped: the API as one committed esbuild bundle (`server/bundle/app.mjs`, built by
  `npm run build:api` and by `npm run build`) behind a plain-JS `api/index.js` that answers JSON
  `FUNCTION_LOAD_FAILED` if the bundle cannot load; a catch-all in the bundle entry; the function
  moved to `api/index.js` with a `/api/(.*)` rewrite because Vercel routed `[...path]` as one
  segment; `npm run test:vercel-function` (plain node, nft trace, `vercel build` output, routing
  replay, the demo flow end to end) as a required CI step with a bundle freshness check; the
  production-like e2e servers load the real function file; DEPLOY.md, SITE-REPORT, CLAUDE.md.
- Open: merge, let Vercel deploy, open `/api/health`: JSON, not an error page.

## Prompt 10

### M1: tokens, kit and /kit

- Shipped: `src/styles/tokens.css` rewritten (one variables file, the Shop Sign palette, the six
  type sizes, motion tokens, dark values per the brief); `@fontsource-variable/jost` replaces the
  three static weights; `base.css`, `kit.css`, `frame.css`, `motion.css` split by job; the kit
  rebuilt (Button variants primary, accent, outline, ghost, onink; OptionCard, Label,
  SectionHead, PriceRow, PhotoFrame, ChairCard, StepBar with numbers, Ticket with a drawn check,
  Toast with pause on hover, Dialog under Sheet, Modal and Lightbox, Reveal and Lines, TopStrip,
  Header, MobileMenu, BottomBar); `/kit` shows every component in every state in both themes;
  `docs/DESIGN-SYSTEM.md` and `docs/brand/DESIGN-DIRECTION-V2.md`; `announcement` in shop settings
  and the public shop response (the editor is prompt 11's).
- Transitional: `src/styles/legacy.css` aliases the old token names for the pages not yet rebuilt
  (removed in M4); the old Nav, Footer and StickyCTA still run until M2.
- Tests: `tests/unit/motionCss.test.ts` (durations from tokens, allowed animated properties, no
  loops but the spinner, no literal colors or font sizes in the kit stylesheets).

### M2: the frame

- Shipped: TopStrip (announcement from shop settings, default "Walk ins welcome" plus a red
  "Book online" link; an empty ink bar while settings load), the Header (stacked logo below 1024px,
  wordmark above, hamburger that becomes an X, a Book a chair button always visible on desktop), the
  full-screen ink MobileMenu (big caps links, theme switch, Call and Book, page behind inert), the
  phone BottomBar (CALL and BOOK NOW; BOOK MARCUS on a profile; BACK and CONTINUE, then CONFIRM
  BOOKING, with a total row in booking; hides for the keyboard; publishes `--bar-h`), a Footer with
  no build stamp and no staff link, `viewport-fit=cover`, and a no-JavaScript fallback in
  `index.html`. The old Nav and StickyCTA are gone; the build sha is only in `/api/health`.
- Tests: `tests/e2e/frame.spec.ts` (bar visible at 390 and 60px tall, hidden at 1280 and in /admin,
  /setup and /kit, labels per page and per booking step, hidden while a field has focus, never
  covers the page end, no build text or staff link on any public page, the menu).

### M3: the public pages

- Shipped: Home in the order of the brief (hero text with the four line H1 and EXQUISITE in red, the
  info row from shop data, the hero photo only when one exists, Today's chairs, The Menu in an ink
  band, The Work hidden when empty, Visit with today highlighted, the ink CTA band); Services as an ink
  page with group chips and counts and PriceRows that link to `/book?service=id`; The Chairs
  ("Pick your chair"); the profile (portrait, name in display type, next 3 openings, services, work);
  Gallery (2 and 3 columns, barber chips, swipeable lightbox); Visit.
- Motion on these pages: hero line rise and settle by 610ms, scroll reveals with stagger, photo wipes,
  the CTA line rise, and page transitions (a 250ms cross-fade through `document.startViewTransition`,
  taken in the kit `Link`).
- Tests: `tests/e2e/motion.spec.ts` (hero timing and full opacity, hidden below the fold and revealed
  once, nothing hidden or transformed under reduced motion, nothing hidden without
  IntersectionObserver, a no-JavaScript page, CLS under 0.1, a view transition on navigation).

### M4: Book, Manage, overlays and the admin restyle

- Shipped: Book with the four part StepBar (1 SERVICE, 2 BARBER, 3 TIME, 4 DETAILS; day and time share a
  part, details and confirm share a part), numbered ink circles on every step heading, OptionCards for
  services, barbers and "Anyone available", the day strip with open counts, times grouped into morning,
  afternoon and evening, the details form built from the kit's Input and Textarea, the confirmation and
  Manage as a Ticket (it rises and its check draws itself), the cancel confirmation in a Sheet, step
  content that slides the way you are travelling; the admin screens on the new tokens with the 13 to
  22px scale, color fades on status changes, new items sliding in and still skeleton blocks while
  loading; the temporary `legacy.css` is gone.
- Tests: `tests/e2e/kit.spec.ts` (every kit section in both themes, a sheet opens in 250ms and closes in
  150ms, the modal and the swipeable lightbox), `/kit` is absent from the production build.

### M5: Cloudinary photos

- Shipped: the `cloudinary` storage driver (signed browser uploads, verification on confirm,
  destroy on delete, the 24 hour orphan sweep, a signed doctor ping), `STORAGE_DRIVER=cloudinary`
  allowed in production without DEMO_MODE and requiring the four CLOUDINARY variables (Preview must
  use a folder that says preview), responsive images (`f_auto,q_auto,c_fill,g_auto`, four widths,
  `sizes`, lazy below the fold, `fetchpriority=high` on the hero), the CSP naming `res.cloudinary.com`
  and `api.cloudinary.com` only, `npm run photos:migrate -- --from mongo --to cloudinary [--dry-run]`,
  DEPLOY.md section 10b and the env table.
- Tests: signing and URL building (`tests/unit/cloudinary.test.ts`), the env rules, the CSP, a fake
  Cloudinary (`tests/helpers/fakeCloudinary.ts`) driving upload, confirm, show, delete, the sweep, the
  doctor and who can sign (`tests/integration/cloudinary.test.ts`), the migration
  (`tests/integration/photosMigrate.test.ts`), and the browser picking the right sizes
  (`tests/e2e/cloudinary-images.spec.ts`).

### M6: QA

- Lighthouse mobile on the production-like build (served with brotli like Vercel): Home 95 / 100 / 96 / 69,
  Services 96 / 100 / 96 / 69, Book 97 / 100 / 96 / 69 (performance, accessibility, best practices, SEO;
  the SEO score is the showcase build's noindex), CLS 0 on all three, LCP 2.2 to 2.5s. Without
  compression the same build scored 73 to 76: the local https server now compresses like Vercel's edge.
- Axe (WCAG 2 A and AA): nothing on any public page or booking step, light or dark, at 390 and 1280
  (`tests/e2e/rules.spec.ts`), plus the earlier admin runs. Also tested there: only the six type sizes,
  tap targets of 44px, alt text and dimensions on every image, the hero fitting a 390px first screen.
- Found and fixed on the way: the phone bar's `:hover { color: inherit }` made CONFIRM BOOKING ink on red after a
  tap (hover sticks on touch); the "Today" tag on the hours table failed contrast in dark; the skip link
  was 42px tall; booking tests clicked options through a 1px input.
- Screenshots (light and dark, 390 and 1280, a montage per width and theme): `docs/screens/p10/`;
  recordings of Home scrolling with the menu and of a booking at 390: `docs/screens/p10/motion/`.

## Prompt 11

### M1: kit gaps, dashboard shell, search

- Shipped: `Sidebar`, `StatTile`, `DataTable`, `SearchBox`, `PinPad`, `BarChart`, `Tabs`, `BottomTabs` and
  `IconButton` (with the desktop tooltip) in `src/components/ui/`, styled in `src/styles/dashboard.css`;
  the owner shell (ink 248px sidebar from 1024px, a top bar with search, today's date and New booking, a
  three tab bar plus More below it) in `src/admin/shell/`; `GET /api/admin/search` with the
  `by_name_key` index; `Mark` lost `pole` and `pill` and gained `crest`, `disc`, `arched` and
  `lockup-vertical`.
- Tests: `tests/unit/search.test.ts`, `tests/integration/adminSearch.test.ts`, the authz matrix row,
  `tests/e2e/dashboard.spec.ts` (shell at 1280 and 390, the `/` shortcut, search by code, phone and
  accent free name, axe in both themes) and the Dashboard section of `tests/e2e/kit.spec.ts`.
