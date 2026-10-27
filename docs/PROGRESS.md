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

### M2: Overview and Bookings

- Shipped: the Overview (alerts strip, quick actions, four stat tiles with compare lines only when last
  week has data, Now and next, the week chart with a text table, the latest eight events), the Bookings
  table (25 per page, sortable, quick filters with counts, barber and status filters, state in the
  address), the booking panel (Reschedule, Cancel or Cancel and notify, Mark done, No show with Undo, Resend
  confirmation with its reason when email is off, Copy manage link, notes, history), and the quick action
  panels (New booking, Walk-in, Block time, Barber out today, Edit announcement). Server: `GET
/api/admin/overview`, `GET /api/admin/booking-table`, `POST /api/admin/bookings/:id/resend`, the `alerts`
  collection, Move in the resolver, `features.email` on `/api/auth/me`.
- Tests: `tests/integration/adminDashboard.test.ts`, `resolverMove.test.ts` (including the race), the
  authz matrix rows, and `tests/e2e/dashboard.spec.ts` (overview, filters, deep link, cancel, announcement,
  axe in both themes at 1280 and 390 on the overview, the list and the panel).

### M3: Schedule, Customers, Team

- Shipped: the Schedule (day grid with a column per chair, hatched blocks, gray time off, a red now line,
  click an empty slot or a chair's plus to open New booking filled in; week table of counts that opens a
  day), Customers (list grouped by phone, search, sort, a panel with history and a private note), Team
  (cards with an In or Off today switch and the next booking; a profile page with Profile, Services, Working
  hours and Time off tabs; Add barber; Remove from schedule through the resolver), the alert resolver
  (Decide on the overview strip), and the removed barber redirect. Server: `GET /api/admin/schedule/week`,
  `GET /api/admin/customer-list`, `PUT /api/admin/customers/notes`, `POST /api/admin/alerts/:id/resolve`
  and `/dismiss`, the `customerNotes` collection.
- Tests: `tests/integration/customersAlerts.test.ts`, `removedStaff.test.ts`, the authz rows and
  `tests/e2e/team.spec.ts` (schedule, week, customers, resolver Move end to end, add and remove a barber,
  the In or Off switch, axe in both themes at 1280 and 390 on every new screen).

### M4: Website and Settings

- Shipped: Website at `/admin/website` with five tabs (Hours with closed days and special hours through the
  resolver, Announcement, Services with add, edit, hide and drag or arrow reorder, Home photo with phone and
  computer crop previews, Gallery with multi upload, required alt text, barber tag, reorder, edit and
  remove), each with View on site. Settings at `/admin/settings`: Shop info with the three social links,
  Booking rules in hours, Account (change email, change password, theme, sign out everywhere), Email
  (read only, with why) and Demo data (demo only). Server: `POST /api/me/email`, `staffId` on the photo
  patch.
- Tests: `tests/integration/ownEmail.test.ts`, the photo tag tests, the authz row, and
  `tests/e2e/website.spec.ts` (every tab, the closed day resolver, services, home photo, gallery, settings
  saves and errors, email change and back, axe in both themes at 1280 and 390).

### M5: the barber portal

- Shipped: `/team`, one shared link. Tap a name, then a 6 dot PIN pad that submits on the sixth digit.
  Four tabs: Today (Next up with Done and No show, the day, Add note, Undo, Walk-in), Week (seven days
  with counts), Time off ("I am out today" with a confirm, Block time, Days off ahead, requests waiting)
  and Me (change PIN, theme, sign out). `/team/setup/:token` is the one-time link where a barber chooses and
  confirms a PIN. The owner's Team page has a new Access tab: Copy setup link, Reset PIN, Unlock, last sign
  in. Barbers can no longer sign in at `/admin`.
- Server: `staffPins`, `setupTokens`, `teamSessions`; the `team` auth level; `/api/team/*` (16 routes) and
  `/api/admin/staff/:id/access|setup-link|unlock`; demo PIN seeding.
- Tests: `tests/unit/pin.test.ts`, `teamAuth.test.ts` (links, hashing, 12 hours, identical failures, lockout,
  address limit, change PIN, audit), `teamPortal.test.ts` (day, status, notes, out today and the owner's
  decision, days off, blocks, walk-in), `idor.test.ts` rewritten for the barber API, the demo PIN tests in
  `demo.test.ts`, the authz matrix across anonymous, barber, owner and temporary password, and
  `tests/e2e/portal.spec.ts` (sign in, the whole barber day at 390, setup link, lockout and unlock, axe on
  every screen in both themes).

### M6: demo notice, icons, social links, fixes, guides

- Shipped: the demo notice (D11-36), icons on the bottom bar, hero facts, Visit facts, step bar, ticket and
  toasts, `SocialIcon` and the footer follow links (D11-37), the footer crest, the outage fallback for public
  pages (D11-39), the 170 by 40 phone logo (D11-41), the `/team` disc mark, Directions icons.
- Docs: `OWNER-GUIDE.md` and `BARBER-GUIDE.md` rewritten as step by step scenarios with screens in
  `docs/screens/p11/guide/`; `DESIGN-SYSTEM.md`, `ARCHITECTURE.md`, `SITE-REPORT.md` and `DECISIONS.md`
  updated.
- Captures: `tests/e2e/p11-capture.ts` (`milestones`, `guide`, `m6`, `recordings`); montages per milestone in
  `docs/screens/p11/m*/`; recordings in `docs/screens/p11/recordings/`.
- Tests: `tests/e2e/chrome.spec.ts`, `outage.spec.ts`, the demo notice suite in `tests/e2e/demo/demo.spec.ts`.

## Prompt 12

### M1: shop facts, hours, the team and the Iniya rules

- Shipped: the real address (Suite F), phone, hours (closed Monday, 10:00 to 19:00 Tuesday to Sunday),
  announcement and Google block in `seed/shop.ts`; the five real people with their own menus and hours; the
  15 real services (shop prices, no per barber overrides yet); `settings.google` (zod, backfilled for old
  documents, served on `/api/shop`); `shared/lib/google.ts` (Maps and write-a-review links, used by every
  Directions button); `shared/lib/email.ts` (the placeholder email never reaches a public page, the JSON-LD
  or the calendar file); the JSON-LD with the phone, Suite F, hours and the Instagram page and no rating.
- Iniya: the card says "Book through Instagram" and opens her Instagram (Home) or her page (Chairs); her page
  has the same button and no Book button; `/book?barber=iniya` moves to anyone available; first available,
  the picker and availability already skipped her and now have tests that prove it; her page stays in the
  sitemap. The barber walk-in form and the owner's New booking panel list only the services the chosen chair
  offers, because the menus are no longer the same for everyone.
- Tests: the old barbers (marcus, dee, tre, jay, kris), services and fake phone were migrated across the
  integration, unit and end to end suites, `scripts/` and the Kit; new `tests/integration/realShop.test.ts`,
  `tests/unit/google.test.ts`, `tests/unit/offlineBooking.test.ts`, `tests/e2e/realshop.spec.ts`; the demo
  spec expects the five real names.
- Review fix-up: the public booking flow lists only the preselected chair's services (with a "See every
  service" button), the calendar download carries Suite F, a settings save without `google` keeps the stored
  value, Iniya's page snippet no longer promises openings, the new-tab links say so to screen readers, and the
  hollow Iniya flag test now has hours and a menu so it fails if the flag is ignored. New tests:
  `tests/unit/offeredServices.test.ts`, `chairDescription` and `addressLine` unit cases, the settings and Iniya
  integration cases, and a "a chair only lists the services it does" group in `tests/e2e/realshop.spec.ts`
  (public flow, owner New booking panel, barber walk-in form). Decisions D12-20 to D12-25. The owner guide PDF
  is re-rendered in milestone 5.

### M2: per barber prices

- Shipped: `staff.servicePrices` (optional `{serviceId, priceCents, durationMinutes?}` list, zod in `shared`,
  validated on the staff create and update routes); `shared/lib/servicePricing.ts`, the one helper behind every
  price (chosen or assigned barber, first available as a "from" price, several services, the price list); the
  seed overrides for Dontrise, Drew and Nelly from the menus.
- Server: the availability engine quotes per chair (a chair's own time decides which starts it gets and where its
  slot ends), booking create, walk-in and phone bookings store the assigned chair's price, lines and minutes,
  reschedule keeps them on the same chair and re-resolves on a move to another chair, next openings and a chair's
  openings use the chair's own times, `/api/staff` carries the prices, and `staff.prices.update` is audited with
  both sides. Emails, the ticket, the manage page, the admin views and the team portal read the stored snapshot.
- Client: `/services` and the Home menu show "From $x" where barbers differ, a chair page shows that person's
  prices and minutes, the booking steps price the chosen chair (or the lowest total for first available) and the
  barber step shows each person's total, the owner New booking panel and the barber walk-in form price per chair,
  and Team has a Prices tab (`PriceOverrideEditor`, also in `/kit` and `DESIGN-SYSTEM.md` with its states).
- Tests: `tests/unit/servicePricing.test.ts`, `staffPrices.test.ts`, per chair cases in `availability.test.ts`,
  `tests/integration/barberPrices.test.ts` (override price and time on the booking, emails, admin and manage
  views, first available, reschedule, validation, owner only), `tests/e2e/prices.spec.ts`; the Prices tab is in
  the Team axe run and `/kit` lists the new section. Decisions D12-26 to D12-40.

### M3: seed photos

- Shipped: `server/services/seedPhotos.ts` loads `seed/photos/manifest.json` (or SEED_PHOTOS_DIR) through the
  active storage driver as normal photo records (kind, alt, sortOrder and the new optional `home` flag from the
  manifest, no chair, width and height from the WebP header via `server/lib/webpSize.ts`, no new dependency). It
  is idempotent (`_id = seedId('photo', file)`; an existing record, even a deleted one, is kept, and the hero
  only fills an empty slot), skips missing files with one warning that names them, and never throws for a
  missing file, manifest or storage. Object keys come from the database, the file and its bytes. Server writes
  go through `storePhotoBytes` (shared with photos:migrate; Cloudinary gets the signed form).
- Hooks: bootstrap's demo branch runs it, so the first visit setup and Demo data, Reset both load the photos;
  `npm run photos:seed` (`scripts/photos-seed.ts`) does it for a real launch. DEPLOY.md section 11 says how,
  and that the live showcase needs a Reset after deploy.
- Bundle: `vercel.json` `includeFiles` is `{server/bundle/**,seed/photos/**}`; the loader reads the folder at
  run time. `test:vercel-function` copies the `includeFiles` set into the nft shape, reads Vercel's
  `filePathMap` for the `vercel build` shape (that is where `vercel build` lists included files), and proves
  in both that setup serves `exq-01-hero.webp` byte for byte and seeds every delivered gallery photo.
- Placements: the hero with a photo is an ink band; on phones and tablets the photo fills it behind
  `--scrim-photo` (new token, contrast worked out in DESIGN-SYSTEM.md) and the small labels turn white; from
  1024px it sits in its own column. The hero photo lost its reveal wrapper (LCP). Home "the work" asks
  `/api/gallery?home=true` (marked photos first) and shows six, or one row of three with three to five, or
  nothing under three. A chair page shows its credited work, else up to three shop photos labeled "From the
  shop", else nothing. Gallery chips already hide while nobody is credited. Crops: hero `85% 30%`, tiles
  `50% 35%` (checked on a contact sheet of all 15 photos). Visit has no storefront slot (open item).
- Photos: the milestone started with 3 of 16; the lead added the rest during it (a83d278) and dropped
  exq-15 (b25a294), so all 15 manifest photos load now and Home shows the six marked photos.
- Tests: `tests/unit/webpSize.test.ts`, `tests/unit/workPhotos.test.ts`, `tests/integration/seedPhotos.test.ts`
  (stores, sizes, idempotent, keeps deleted and owner heroes, picks up a new file, one warning, never throws,
  the public API in manifest and Home order), demo setup and reset cases in `tests/integration/demo.test.ts`
  (fixture folder), and the demo e2e now reads the manifest for what to expect (not run in this milestone).
  Full vitest 579 passed; build and `test:vercel-function` (97 passed) green. Decisions D12-41 to D12-55.
- Known gaps for milestone 5: no screenshots yet of the new hero, Home work and chair strips (Rob's rule: no
  Playwright until milestone 5); Website, Home photo still previews the phone hero as a 4:5 frame while phones
  now show the photo behind the text; the owner cannot change the Home pick in the dashboard yet.

### M4: reviews

- Shipped: `settings.reviews` (`{ enabled, items }`, zod in `shared/schemas/shopSettings.ts`: at most 30,
  text up to 600, stars 1 to 5, source google or thecut, optional YYYY-MM-DD date, `staffId`, show, sort
  order), backfilled as empty for older documents; `shared/lib/reviews.ts` (which reviews show, a chair's
  three, the month label, the "4.7 on Google from 15 reviews" line). The seed holds the 18 real reviews word
  for word from `reviews_for_site` (Google without Wesley T., Lamont I. short, Dontrise's three on his chair,
  Drew's five and Nelly's four from theCut with no date), all shown, Home's three first.
- Server: `PUT /api/admin/reviews` (owner only, strict: show, hide and order every stored review, the
  section switch, and the Google rating, count and date; no text, no new review, no place id), one
  transaction, audit `settings.reviews.update`. `PUT /api/admin/settings` strips `reviews`, so a save that
  omits them keeps them and one that carries them changes nothing. `/api/shop` serves only the shown
  reviews, none while the section is off.
- Client: Home "What clients say" after the work (the rating line with "Read them on Google" and "Leave a
  review", then the first three shown: Unique D., Ricardo E., Routine Life Fitness); a chair page shows up to
  three of its own under the menu; both hide when nothing would show. New `Stars`, `RatingLine`, `ReviewCard`
  and `ReviewList` (`src/components/site`) and `ReviewsEditor` with the Website, Reviews tab
  (`ReviewsPanel`): loading, error and empty states, a toast on every save. All in `/kit` (section "Reviews")
  and `DESIGN-SYSTEM.md`. JSON-LD still has no rating markup.
- Tests: `tests/unit/reviews.test.ts` (schema limits, stars, sources, text length, date format, the strict
  request, which reviews show), `tests/integration/reviews.test.ts` (seeded content equals the data file,
  the public API sends only shown reviews, show, hide, reorder and the rating through the route, validation
  and conflict errors change nothing, owner only, the audit entry, the settings save keeps the reviews),
  the route in `authz.test.ts`, and the JSON-LD test now passes reviews in. `tests/e2e/kit.spec.ts` lists the
  new section (not run: no Playwright in this milestone). Decisions D12-56 to D12-66.
- Open for Dontrise: permission to use the reviews, and whether "Mike" in two of Nelly's reviews is fine.

### M5: copy sweep, guides and docs (part A)

- Copy sweep over `src`, `server` (with the email templates), `shared`, `seed`, `scripts`, `tests/helpers` and
  the living docs: no old stand-in phone, no personal number, no made up barber names, no em dashes, no emoji in
  code or copy. Two written-in numbers fixed: the Visit page's "2 hours" and the manage page's "1 hours" now
  read the cutoff setting through `src/lib/booking/policy.ts`. The copy rules unit test now covers `server`,
  `scripts`, `tests/helpers` and the living docs, and fails on the old names and numbers in the copy and guides.
- Gallery tab: crediting a photo and saving its alt text now show a toast, like every other save.
- `docs/OWNER-GUIDE.md`: Team, Prices; Website, Reviews (show, hide, order, the switch); the Google rating
  fields; crediting gallery photos to a barber; a "Check before the real launch" section listing every
  PLACEHOLDER for Dontrise. `docs/OWNER-GUIDE.pdf` re-rendered with `scripts/guide-pdf.ts`, which now keeps
  wrapped lines together and list numbers right. `docs/BARBER-GUIDE.md`: the walk-in list and photo credits.
- `docs/ARCHITECTURE.md` (google and reviews settings, the pricing rule, the booking snapshot, the seed photo
  id), `docs/DESIGN-SYSTEM.md` (ReviewsPanel, photo rules), `docs/DEPLOY.md` section 11 (what the seed holds,
  Reset after deploy, Cloudinary for a real launch), `docs/SITE-REPORT.md` (prompt 12 additions, open items).
- `/kit`: ReviewsPanel's loading and error states (`ReviewsPanelState`) join the Reviews block;
  `tests/e2e/kit.spec.ts` checks the states of RatingLine, ReviewCard, PriceOverrideEditor, ReviewsEditor and
  ReviewsPanel, and finds kit blocks by class (not run: Playwright waits for the milestone 5 captures).
- Tests: new `tests/unit/bookingPolicy.test.ts`; `copyRules.test.ts` and `pii.test.ts` updated. Full vitest
  613 passed in 82 files; typecheck, lint, build and format:check green. Decisions D12-67 to D12-74.
- Left for part B: screenshots at 390 and 1280, Lighthouse and axe, recapturing the owner guide screens (they
  still show the sample barbers from prompt 11) and re-rendering the PDF, and the report.

### M5: screenshots, axe and Lighthouse (part B)

- Screens: `tests/e2e/p12-capture.ts` (demo build on 4176 after Demo data, Reset; reads only) saved Home, Gallery,
  Services, Drew, Iniya and Visit at 390 and 1280 in light and dark (first screen `-top` and full page), the
  owner's Website, Reviews, Home photo and Gallery tabs and Team, Prices (Drew) at 390 and 1280, and montages,
  in `docs/screens/p12/`. Real state only: all 15 photos are delivered, so no fixture set (D12-75).
- Fixed from the screenshots: the hero title and info values were ink on the ink photo band in the light theme
  at every width (D12-76); the Website, Gallery tab scrolled sideways at 1280 because the row tooltips carried
  the full alt text (`IconButton` `tip`, D12-77). No public page overflows at 390 or 1280.
- Axe and the design rules: `tests/e2e/rules.spec.ts` adds Drew's and Iniya's pages and a "with the shop
  photos" group (stubbed real photos, D12-78): axe at 390 and 1280 in light and dark, alt text and sizes, the
  hero first screen with the photo and the colors over it. 17 passed in one run.
- Lighthouse mobile once on the demo build with the photos: Home 81, Gallery 74, Drew 93, accessibility 100,
  CLS 0 (D12-79, `docs/screens/p12/lighthouse.json`). Home and Gallery miss the 85 target because the GridFS
  photos are served full size; not fixed here.
- The red display line over the hero photo measures 3.99:1 at 390 (large text passes 3:1, the checklist asks
  4.5:1); left for Rob (D12-80).
- Not done in this part: the owner guide screens (still the prompt 11 sample barbers) and the report.

### M6: review fixes (moves reprice, exact chair prices, hero red, settings, sitemap)

- Moves reprice (Rob, D12-81): the resolver's Move prices the booking for the new chair with the shared
  `quoteMove` and stores its lines, minutes, total, end time and locks over the new length in the same
  transaction; a length that does not fit is not offered and fails cleanly. `moveOptions` carry each chair's
  price and minutes ("Drew, $40" in the Move to list, a "With Drew: $40, 45 min (now $50, 75 min)" line
  under it), the owner's Reschedule shows the price per barber too, and the customer is emailed the new
  barber and price (link version up, like a reschedule).
- Exact chair prices (Rob, D12-82): one person's price is never "From" (chair pages, a chosen barber in
  booking, the ticket, emails, admin, Team, Services); "From" only on `/services`, the Home menu and first
  available.
- Hero red (Rob, D12-80): "Exquisite" was already #FF5470 (`--red-on-dark`) on the photo in both themes but
  measured 3.99:1 at 390 and 3.67:1 at 768 on the real photo; `--scrim-photo` went from 80% to 87% ink, the
  lightest step that passes: 4.75:1 at 390 and 4.51:1 at 768 (86% gives 4.34:1). Measured once on the demo
  build with the title hidden (the milestone 5 method); `tests/unit/heroScrim.test.ts` and the rules spec
  hold it. The `docs/screens/p12/` hero shots still show the 80% scrim (no p12 recapture, per Rob).
- Review findings: a settings save no longer writes the Google block (D12-84); the sitemap skips chairs that
  take no online bookings, Iniya included (D12-85); the placeholder email literal moved into `seed/shop.ts`
  (D12-86). Rejected: the hidden barber walk-in claim (a hidden barber has no portal session, D12-87).
  Deferred to the final step: the owner guide screens and PDF (Rob), the report. Lighthouse stays open (D12-83).
- Tests: new `tests/unit/heroScrim.test.ts`, `menuPrices.test.ts`, `moveOption.test.ts`; four new resolver move
  tests (prices on the options, override to shop price and back with cents, minutes, end, locks and the email,
  a longer length that does not fit); the two tab Google test; the sitemap and email location tests. E2e
  expectations updated for exact chair prices, the move option prices and the sitemap (not run here; the final
  gate runs them).

## Prompt 13a

### M1: Today's chairs carousel

- Shipped: `src/components/site/carouselAutoplay.ts`, `useCarousel.ts`, dots in `TodaysChairs.tsx`,
  the strip rules in `base.css` (carousel to 1024px) and the dots in `pages.css`.
- Tests: `tests/unit/carouselAutoplay.test.ts` (6), `tests/e2e/carousel.spec.ts` (snap, dots, page
  scroll over the strip, auto-advance and its stop, reduced motion).
- Heartbeat: 01:29 UTC, next is M2 (scroll spec, overflow fixes, lighter reveals).

### M2: smooth scrolling and lighter reveals

- Shipped: `tests/e2e/scroll.spec.ts` (no sideways overflow at 360, 390, 414 on ten public pages,
  all passing as found), reveal tokens `--d-reveal` and `--stagger-reveal`, 8px travel, early
  rootMargin in `useReveal`, passive visualViewport listener, dvh on body.
- Heartbeat: 01:33 UTC, next is M3 (Visit map, hero gradient, no-photo panel, Iniya's bar, site.spec).

### M3: Visit map and four fixes

- Shipped: `VisitMap` on Visit with the CSP `frame-src`, the hero gradient scrim (measured), the
  no-photo panel in `PhotoFrame`, the Instagram phone bar on chair pages, and the narrowed
  site.spec check. Tests: `tests/e2e/p13a.spec.ts`, `heroScrim.test.ts`, `csp.test.ts`.
- Heartbeat: 01:41 UTC, next is SHIP (gate, screenshots, Lighthouse, report, PR, merge).
- SHIP: 02:01 UTC, gate green after two narrowed Iniya checks, screens and Lighthouse captured
  (Home 88, Visit 95), report written; next is the PR and the merge.

## Prompt 13b

### M1: Archivo everywhere

- Shipped: `@fontsource-variable/archivo` (wdth.css, one preloaded latin file with both axes), width
  tokens, weights raised for labels, prices and headings, the email stack, og.png and OWNER-GUIDE.pdf
  re-rendered, buttons that wrap a long label. Hero contrast with Archivo: 390 red 5.07:1 white
  10.59:1; 768 red 4.89:1 white 8.88:1; 1280 on ink 6.07:1 and 18.88:1. Scroll, carousel, chrome,
  rules, p13a and kit specs pass.
- Heartbeat: 22:27 UTC, commit follows, next is M2 (the dark dashboard shell).

### M2: the dark dashboard shell

- Shipped: `--adm-*` tokens and the dark scope on the admin app, a shell with no side menu (top bar
  with the Shop | Website switch remembered per device, search, clock, New booking, account menu;
  section tabs under it), new `/admin/shop/*` and `/admin/website/:tab` routes with every old path
  redirecting, the Website page keyed by path, the Appearance switch removed, red primary buttons in
  the dashboard, `Sidebar` deleted. dashboard.spec and website.spec rewritten for the shell and pass
  (23 of 23); axe clean in the shell, on Overview, Bookings, the booking panel, the website and
  settings sections at 1280 and 390.
- Heartbeat: 22:52 UTC, commit follows, next is M3 (the floor on Shop, Today).

### M3: the floor

- Shipped: `arrivedAt` and `startedAt` on bookings, `GET /api/admin/floor`, `POST .../arrived` and
  `.../start` (idempotent, audited, owner only), pure floor rules in `shared/lib/floor.ts`, the
  Today page (chair cards, Coming up with Arrived, Start, Move and No show, Today so far, Done today
  with All n, 30 second refresh) replacing Overview with its alerts, quick actions, chart and
  activity kept. Tests: `tests/unit/floor.test.ts` (6, frozen clock), the arrived and start
  integration test in adminApi.test.ts, `tests/e2e/floor.spec.ts` at 1180 (Arrived, Start, Done on
  a walk-in seeded for later today).
- Heartbeat: 23:05 UTC, commit follows, next is SHIP (gate, screenshots, Lighthouse, report, PR).
- SHIP: 23:36 UTC, gate green after five spec fixes for the new paths and one weekday de-flake,
  screens and Lighthouse captured (Home 79 then 84, 13a was 88; the 91 KB font is the cause),
  report written; next is the PR, the merge and the production check.

## Prompt 13c

### M0: font instancing and the Today cleanup

- Shipped: Archivo instanced to width 100 to 125% and self-hosted (62 KB, one static preload), the
  week chart and recent activity moved under the Bookings list, the standing full-screen booking
  rule in CLAUDE.md. Lighthouse is measured once before SHIP.
- Heartbeat: 00:16 UTC, commit follows, next is M1 (the walk-in line).

### M1: the walk-in line

- Shipped: `walkIns` collection and repo, pure wait estimates, the line service (add, update,
  move, left, seat through the booking service and slot locks), owner and barber routes, the
  Today panel (numbered cards, Seat, Move sheet, Left, up and down, Add walk-in) and "Seat
  walk-in #n" on free chairs. Tests: waitEstimate (7, frozen clock), line integration (4: add,
  order, estimate, phone check, seat with arrivedAt, busy refusal, concurrency, barber scope).
- Heartbeat: 00:21 UTC, commit follows, next is M2 (the full-screen NewBookingFlow).

### M2: the full-screen NewBookingFlow

- Shipped: `src/booking-flow/NewBookingFlow.tsx` (Service, Barber, Time with NOW first, Client with
  the owner's client search, Confirm, the ticket), the `full` dialog variant, every entry point
  opens it (top bar, Add walk-in, Seat from a free chair, Move, Reschedule, portal Add booking and
  Walk-in); the New booking drawer and the portal forms are deleted. NOW goes through `bookNow`
  (free chair with nobody ahead books this minute through the booking service and slot locks, else
  joins the line). Tests: now integration (4), flow e2e (owner 1440, barber 390, discard, entry
  points at 1440 and 390), updated dashboard, team, realshop, portal and authz specs.
- Heartbeat: 00:50 UTC, commit follows, next is M3 (the front desk check in).

### M3: the front desk check in

- Shipped: `/admin/checkin` and `/team/checkin` (no shell), the start screen with Walk in, I have
  an appointment and every chair's state, Walk in through the flow in check-in mode (always NOW,
  big tiles, end screen, back after six seconds), the masked appointment lookup and the arrived
  tap for owner and barber sessions, Check in buttons in the top bar and the portal, the Wake Lock,
  the "Keep the check-in tablet signed in" setting. Tests: checkIn integration (3: masking and
  matching, owner lookup and arrive, barber scope), checkin e2e at 1180x820 and 820x1180 (3).
- Heartbeat: 01:08 UTC, commit follows, next is SHIP (gate, Lighthouse, screenshots, report, PR).

### SHIP

- Gate green (668 unit and integration, 153 dev e2e with three spec-state fixes rerun, prod-like 7,
  showcase 13, vercel-function 97), Lighthouse Home 92, screens in docs/screens/p13c, PR 13 merged
  into main as e95d10a at 10:38 UTC. Next is 13d (the barber portal redo and the website editor).

## Prompt 13d

### M0: the five fixes from 13c

- Shipped: the hours rule for NOW and the line (shared helper, SHOP_CLOSED and BARBER_OFF, the
  flagged line entry, no "wait time unknown" with 0 minutes), the day strip on the time step, the
  check-in choices filling the screen with icons and 46px titles, no green on admin or portal
  surfaces, the per-device tablet flag replacing the shop-wide setting. Tests: openNow unit (4),
  now integration (6, two refusals), tabletSession integration (1), line, checkIn and authz.
- Heartbeat: 11:21 UTC, commit follows, next is M1 (the barber portal redo).

### M1: the barber portal redo

- Shipped: Who's working? cards and the PIN pad with Show and Hide, the dark portal, Today with
  the barber head, Add booking (NOW first), Out for the day (full-screen confirm), Check in, In
  your chair (current cut, first walk-in with Start cut, next client with Start cut), the day list
  with source tags and done rows at the bottom, Me with the profile, 30 second refresh, barber
  arrived and start routes. Tests: portal13d e2e at 390 with axe on every screen, portal, flow,
  team, realshop, checkin and admin specs updated.
- Heartbeat: 11:53 UTC, commit follows, next is M2 (the website editor).

### M2: the website editor

- Shipped: one editor at /admin/website?section with the list and status tags, the live preview
  (phone and computer, full screen under 1280), the hero copy and Visit words as settings with the
  stale-save refusal, every old address redirected. Tests: hero unit (3), settingsEditor
  integration (1), editor e2e at 1440 and 390 with axe, website, dashboard and admin specs updated.
- Heartbeat: 12:13 UTC, commit follows, next is M3 (the guides).

### M3: the guides

- Shipped: docs/OWNER-GUIDE.md (15 sections: the two sides, the floor, the line, New booking with
  Now, bookings, schedule, the check-in tablet, clients, team, logins, the editor, settings,
  launch checks, who to call) and docs/BARBER-GUIDE.md (cards and PIN, Today, Add booking, Done,
  Out for the day, week and time off, Me, the tablet), screens in docs/screens/p13d/guide, the PDF
  re-rendered. Lighthouse mobile Home 85, CLS 0.
- Heartbeat: 12:21 UTC, commit follows, next is SHIP.

### SHIP

- Gate green after four spec fixes (680 unit and integration, dev e2e 156 plus the reruns, prod-like 7,
  showcase 13, vercel-function 97), Lighthouse Home 85, screens in docs/screens/p13d, PR 15 merged
  into main as 92bf393 at 13:07 UTC. This closes the three-prompt dashboard and portal revamp.

## Prompt 13e

### M0: portal fit at 360 and 390

- Shipped: the portal fit rules in `src/styles/team.css` (D13e-01, D13e-02) and the fit guard
  `tests/e2e/fit.spec.ts` (D13e-03, 4 specs, every portal screen and six public pages at 360 x 740
  and 390 x 844). Demo screens at docs/screens/p13e follow with M1's build.
- Heartbeat: 15:40 UTC, commit follows, next is M1 (the hero and honest saves).

### M1: the hero and honest saves

- Shipped: the shop request starts from the head script on public paths and Book and Manage are
  their own chunks (D13e-04); the Cloudinary widths stay the hero's responsive set (D13e-05);
  `/api/shop` is never cached, so the editor says "Saved. Live on the site now" (D13e-06).
  Lighthouse Home 84, LCP 3.7 s in the report run (2.8 s in the first run), CLS 0.
- Heartbeat: 15:50 UTC, commit db26b5c, next is M2.

### M2: the $10 launch offer

- Shipped: `launchOffer` in the settings and `discounts` on the booking (D13e-07), the decision
  inside the booking transaction with the unique partial index (D13e-08), the tags on Home and
  Book and the confirmation line (D13e-09), the owner, barber, email and editor views with the
  usage count (D13e-10). Tests: 10 unit, 2 integration (one the race), 1 e2e at 390.
- Heartbeat: 15:58 UTC, commit db26b5c, next is M3.

### M3: the guides

- Shipped: the offer in the owner guide (section 12) and the barber guide (section 3), the PDF
  re-rendered, SITE-REPORT and DESIGN-SYSTEM updated, screens in docs/screens/p13e.
- Heartbeat: 16:05 UTC, commit follows, next is SHIP.

### SHIP

- Gate: 692 unit and integration (one email assertion updated for the offer line), dev e2e 152 of 165
  green on the full run, the 13 red fixed (offer tag contrast and hero height, ticket totals with
  the discount, the head preload removed, the fit guard booking later) and rerun green (49), prod-like
  7, showcase 13, vercel-function 97. PR 17 merged into main as b47f552 at 16:43 UTC; Vercel
  production for it completed at 16:44 UTC.
