# Decisions

One line per call made during a run, newest at the bottom. Each entry says what
was decided, what was rejected, and why. The rules behind them: pick the option
with less code that is easier to verify; outside the brief, pick the plainer
option; drop any effect that costs speed or clarity; the brief wins for new UI,
existing patterns win for shared logic, and the "Must not change" lists always
win.

## Prompt 4: design pass, photos, public pages

- D4-01 Brand SVGs. The brief says they are in `public/brand/`, but no branch has
  them. Placeholder marks were generated with the exact file names the brief
  lists (primary, wordmark, stacked, q-icon, seal, pole, each -black and -white)
  so every reference is wired. They are geometric plus SVG text, so as `<img>`
  the text falls back to the system font. Drop the real files in with the same
  names; nothing else changes.
- D4-02 Fonts. `@fontsource/jost` 5.3, latin subset only, weights 400, 500 and
  700 (three woff2 files, 30 KB). Self-hosted, so the CSP keeps `font-src 'self'`.
- D4-03 Semantic surfaces. The token file holds exactly the variables the brief
  lists. The light and dark surfaces (`--bg`, `--card`, `--border`, `--fg`,
  `--accent-text` and so on) live in `base.css`, derived from the tokens, so
  dark mode is a swap of six variables under `.exq-dark` and the admin media
  query instead of a second stylesheet.
- D4-04 Sheet. Built on the native `<dialog>` with `showModal()`: focus trap,
  Escape, inert background and focus return come from the browser. Rejected a
  hand-rolled focus trap (more code, same result).
- D4-05 Kit CSS. One file, `src/styles/kit.css`, with an `exq-*` prefix per
  component and state on `data-state`. Rejected CSS modules and per-component
  files: one file is easier to audit against the token list.
- D4-06 Existing class names. Prompt 1 and 2 class names and data-state values
  are kept. The old `.exq-button` picks up the kit look through base.css so
  pages not yet restyled are not broken in the meantime.
- D4-07 Kit page. `/kit` exists only in development builds (`import.meta.env.DEV`),
  as one lazy route, so every component state can be screenshotted and checked
  without a storybook dependency. It is not in the production bundle.
- D4-08 Screenshots. `tests/e2e/screens.ts` drives the e2e server with Playwright
  and builds the montage with the ImageMagick `montage` binary already on the
  machine. Rejected a Node image library (another dependency for one job).
- D4-09 Nav. Solid paper bar, sticky, never transparent over photos, so the
  "readable over photos" rule holds without a scrim or scroll effect.
- D4-10 Local uploads. The local driver's PUT and GET live in a small handler
  (`server/storage/localHttp.ts`) mounted ahead of the API router by the dev
  server and the test server, and Vite proxies `/uploads`. Rejected adding API
  routes for it: the router is JSON only and the routes would exist only to
  serve development.
- D4-11 Upload tickets. The issued upload (key, kind, chair, type, size, expiry)
  is a signed, expiring token the client hands back to confirm, so nothing is
  stored for an upload that never completes. Rejected a pending-uploads
  collection with a cleanup job.
- D4-12 Presigned PUT on R2. The URL is signed with query parameters and does
  not bind Content-Type (aws4fetch leaves it unsigned by default); confirm
  checks the stored object's size and type instead, which is the check that
  matters. Rejected signing all headers, which makes browser PUTs brittle.
- D4-13 Deleted photos. A soft delete sets `deletedAt`; the daily cron removes
  the object and sets `purgedAt`. Rejected deleting the object inline: a failed
  delete would then leave an orphan with no record of it.
- D4-14 Next opening. One availability load for 14 days with every active
  service, then one engine pass per chair with that chair's shortest service.
  Rejected a per-chair load (seven queries per chair) and a second engine.
- D4-15 Days count. `availability/days` rows gained `count`; the slots were
  already computed, so this costs nothing and the day chips can show it.
- D4-16 Landing on a time from a link. `/book` with date and time checks the
  slot once against `/api/availability`; if it is gone it steps back to the
  time step with a notice. Rejected trusting the link and failing at confirm.
- D4-17 Chairs page links. On the home strip the whole card goes to
  /book?barber=<slug> as the brief says. On /chairs the card goes to the
  profile, where the bio, openings and the Book button live; a card cannot hold
  two links. Rejected a second Book link inside the card.
- D4-18 Sample photos. Screenshots and the gallery e2e upload canvas-drawn
  WebPs through the real upload flow from inside the browser (no image library
  in Node, and the browser is what encodes WebP in production too).
- D4-19 Service rows. The whole row is the Book link, with a red Book pill at
  the end as the visible affordance, so the tap target is the full row and the
  menu still reads as a list.
- D4-20 Visit copy. The two policy lines and "Parking details coming soon"
  carry the brief's placeholders unchanged; nothing was invented.
- D4-21 Book rows. The service checkbox now covers its whole row (opacity 0),
  so the row is the tap target and the custom check only shows state. Rejected
  a visually hidden 1px input: clicks on the row never reached it.
- D4-22 Sheets and focus. The Sheet focuses its own title on open, and the
  booking step heading takes focus a tick after it mounts, so a closing dialog's
  focus restore never wins over the next screen. Rejected hand-managed focus
  order per screen.
- D4-23 Today cards. Now and Next come from the schedule endpoint (every
  booking of the day) rather than a new API: the page already needed the day's
  counts, and the status switch posts to the existing status route with an
  Undo toast that posts the previous status back. No new routes.
- D4-24 Admin edit sheets. Services and staff became lists with an Edit button
  that opens a sheet holding the existing forms unchanged. The staff sheet also
  carries the photo picker. Rejected rewriting the forms as modal-first.
- D4-25 Upload progress. The PUT goes through XMLHttpRequest because fetch
  cannot report upload progress; everything else stays on fetch.
- D4-26 Admin buttons. Prompt 3 admin forms used plain buttons; a scoped rule in
  admin.css gives every non-kit button the pill look rather than touching each
  form, with kit Buttons used where a form was rewritten anyway.
- D4-27 Sitemap from the API. `/sitemap.xml` is a rewrite to
  `GET /api/sitemap.xml` (vercel.json in production, the Vite proxy in dev),
  built from the live chair list with APP_BASE_URL. Rejected a static file
  written at build time: it would go stale when a chair is added or renamed.
  The router gained one line so a string body with its own Content-Type is
  sent as is.
- D4-28 Layout shift. Lighthouse measured CLS 0.2 on Home and 0.5 on Book and
  profiles: the Jost swap re-flowed the hero and the footer sat in the first
  viewport while a page loaded. A Vite plugin preloads the three Jost files and
  `.exq-main` has a 100svh minimum height. Rejected a metric-matched fallback
  font (guesswork) and hiding content until fonts load (slower first paint).
- D4-29 Meta tags. index.html carries the site-wide title, description and Open
  Graph card (crawlers that build social cards do not run JavaScript), with
  `%SITE_URL%` filled from APP_BASE_URL at build time. `usePageMeta` then sets
  the per-route title, description, canonical, og:url and robots in the
  browser, which is what Google indexes. Rejected server rendering for this.
- D4-30 JSON-LD from the shop API. The BarberShop script is built in the public
  layout from `/api/shop` (name, address, phone, hours) so a change in the
  dashboard reaches search engines without a deploy. Rejected a hardcoded
  block in index.html.
- D4-31 Brand assets rendered once. `scripts/brand-assets.ts` renders the OG
  image, favicons, the maskable icon and the apple touch icon with Playwright
  and the outputs are committed to `public/`. ImageMagick here has no SVG
  delegate, and a one-time render keeps the build free of a browser.
- D4-32 One shop fetch. `/api/shop` is fetched once in the public layout and
  shared through `ShopContext` (`useShop`), so Home, Visit, Book, Manage, the
  footer, the titles and JSON-LD read the same data and the home page makes
  one request fewer. Rejected a second fetch per page.
- D4-33 robots.txt stays static and has no Sitemap line, because that line must
  be an absolute URL and the domain is not known yet. Search Console can take
  the sitemap directly; the line is a one-word change once the domain exists.

## Prompt 5: themes, desktop booking, production readiness

- D5-01 Abandoned uploads are tracked in a `pendingUploads` collection written
  when a URL is issued and removed on confirm, so the sweep is a query. Rejected
  listing the bucket: the storage port has no list operation and R2 listing is
  slow and paged.
- D5-02 Address hashes for the lockout bypass are keyed with MANAGE_LINK_SECRET
  (plain SHA-256 of an IPv4 address is reversible in seconds). Rotating that
  secret also forgets the trusted addresses, which is harmless: they refill on
  the next sign-in.
- D5-03 A sign-in that passed a lockout leaves the lockout in place. Clearing it
  would let the guesser try five more times the moment the owner signs in.
- D5-04 The robots Sitemap line is written into dist/robots.txt by the build
  plugin only when APP_BASE_URL (or Vercel's production URL) is set; the file in
  public/ stays as it was, so a build without the variable is unchanged.
- D5-05 Brand assets: Rob's real SVGs landed on the branch (commit 4054fe1), so
  `scripts/brand-assets.ts` was run and the icons and OG image regenerated.
- D5-06 Theme tokens. The semantic surface variables moved from base.css into
  tokens.css next to the brand tokens, and two new ones (`--selected-bg`,
  `--selected-fg`) replace the `.exq-dark` overrides that components carried
  for inverted selected states. The dark values are listed twice, under the
  attribute and under the media query, exactly as the brief asks; a shared
  block would need a preprocessor.
- D5-07 Logo swap. `Mark` renders both files and CSS hides one, so the swap
  happens with the first paint and needs no JavaScript. The invert filter on
  the admin wordmark was dropped. There is no barber pole divider on the site
  today; `Mark` already serves the pole for when one is added.
- D5-08 The pre-paint script stays a one-liner guarded by `prettier-ignore`, so
  the sha256 in vercel.json matches what the build emits. A unit test hashes
  index.html against the CSP on every run.
- D5-09 Toast and ticket head use the selected tokens (ink on paper in light,
  paper on ink in dark) rather than hardcoded ink, so they stay readable on a
  dark page and match the inverted selection rule from the brand boards.
- D5-10 New dependency: @axe-core/playwright (dev only) for the accessibility
  checks in both themes. It is the standard axe engine behind a Playwright
  builder; nothing else was added.
- D5-11 Desktop Book layout. The page is one grid at 1024px and up: the steps
  on the left, a sticky `BookingCard` on the right. The card is `.exq-dark`, so
  it is ink in light and gets the #1A1A1A surface with the #2E2E2E border in
  dark from the same tokens as every band. Below 1024px the card is
  `display: none` and the StickyCTA bar stays, so the phone flow is untouched.
- D5-12 One Confirm button per screen. On wide screens the inline Confirm on
  the review step is hidden and the card's button submits; the mobile
  StickyCTA was already hidden there. Two visible Confirm buttons would be
  confusing and would break strict role queries in the tests.
- D5-13 Button variant `emphasis` with `--cta-bg` and `--cta-fg` tokens: red on
  paper, paper on ink, and red everywhere in dark. The brief wants the card's
  button white on ink in light and red in dark; a token pair expresses that
  without a theme check in the component.
- D5-14 "Book your chair" and "Takes about a minute." show at every width, not
  only on desktop: one heading per page, and the sub line costs nothing on a
  phone. "First available" reads "Anyone available" on the chair card as the
  brief asks; the ticket still says "(first available)" after booking.
- D5-15 The cancel note is built from `cancelCutoffMinutes`, now part of the
  public shop response (additive), through `cancelPolicyLabel`: whole hours
  read as hours, anything else as minutes, zero as "any time before".
- D5-16 One env list, two layers. The zod schema checks shapes and the two
  values nothing runs without (MONGODB_URI, MANAGE_LINK_SECRET); `envProblems`
  holds what each environment needs and is what the doctor, the router gate and
  `requireEnv` all read. A deployment with problems answers 503 everywhere but
  the health check and the setup routes, so Rob sees the doctor instead of a
  blank site.
- D5-17 Bootstrap secret. Internal routes flagged `bootstrap` take
  BOOTSTRAP_SECRET as well as CRON_SECRET; with a bearer that is not the cron's
  they answer 404 while BOOTSTRAP_SECRET is unset, so the feature does not exist
  once Rob removes the variable. Without any bearer they stay 403 like every
  internal route, which keeps the authorization matrix uniform.
- D5-18 `/api/setup` is a public `{ enabled }` flag so the /setup page can show
  the 404 page before a secret is typed. It reveals only whether setup is on,
  which the page would reveal on the first call anyway.
- D5-19 The doctor's storage check uses the port's new `put` and `get`
  (server-side, for the doctor and the backups), not a presigned PUT from the
  server: one fewer signed URL to build and the same code path the backup uses.
  The local driver accepts `_doctor/` and `_backups/` keys next to photo keys.
- D5-20 The smoke test checks the app shell (200, root element, module script)
  rather than rendering the SPA in a browser: a browser in the Action would
  need Playwright's Chromium download on every run. Everything the SPA needs
  (/api/shop, staff, next openings) is checked directly.
- D5-21 Resend's domain status comes from GET /domains with the API key; no
  email is sent. A missing domain, an unverified domain and a bad key each get
  their own fix line.
- D5-22 Backups go to the photo bucket as canonical EJSON NDJSON, gzipped, one
  file per collection plus a manifest. Rejected mongodump: no binary on Vercel.
  Canonical EJSON keeps Dates and ids exact, which the restore test proves.
- D5-23 Pruning by date arithmetic instead of listing the bucket: the keys are
  deterministic (date plus collection name), so each run deletes the ten days
  just past the window and never needs ListObjects.
- D5-24 One daily cron route. Vercel Hobby allows one run a day; the route runs
  the outbox backstop, the photo purge, the upload sweep, the backup and the
  prune in order and reports each count. The old outbox route stays for a
  manual call. `maxDuration` is 60 seconds for the one function.
- D5-25 PII is masked in the logger itself, not at each call site, so a new
  log line cannot leak an address by accident. The log email channel moved the
  message body to debug level.
- D5-26 The API-down and maintenance states live in the public layout: it
  already fetches `/api/shop`, so a failed fetch or `maintenance: true` swaps
  the page for one ErrorState with a tel button. The phone falls back to the
  seed placeholder compiled in by Vite (`__SHOP_PHONE__`); the placeholder
  itself stays in seed/shop.ts.
- D5-27 Production deploys only from `main`; the branch gets a pull request,
  not a merge, so Rob merges after the variables are set. Preview deployments
  use the Preview environment with their own MONGODB_DB_NAME and
  R2_KEY_PREFIX, which the env rules require.
- D5-28 DEPLOY.md is a numbered click path with a variable table that names
  every value's source and environment but never a value; OPERATIONS.md covers
  what breaks on each rotation. The one thing that still needs a shell is an
  owner password reset when nobody can sign in, documented rather than built.

## Prompt 6: final audit and handoff

- D6-01 The LIVE URL was not filled in and the Vercel preview host is refused
  by this sandbox's proxy, so live-only checks are recorded as "not verifiable
  here" with the exact command for Rob rather than guessed. Nothing was run
  against production.
- D6-02 `docs/brand/BRAND.md` and `DESIGN-DIRECTION.md` do not exist in the
  repository; the audit uses `docs/DESIGN-SYSTEM.md` and the brief's design
  rules as the reference.
- D6-03 The findings are written before any fix (06-audit-findings.md) and the
  scorecard is scored against evidence in `docs/screens/audit/facts.json`, so
  every score can be rechecked by rerunning `npx tsx tests/e2e/audit.ts`.
- D6-04 The per-address login limit is read before the attempt and written only
  after a failure, so a shop tablet can sign in as often as it likes while
  twenty wrong passwords from one address still answer 429. The per-email limit
  keeps counting every attempt: it is the guard against guessing one account
  from many addresses and a real user never hits ten sign-ins in fifteen
  minutes on one email.
- D6-05 The e2e rate-limit reset is a `POST /__e2e/reset` handler inside
  `scripts/e2e-server.ts`, mounted through a `before` hook on the dev server,
  and called once per Playwright run from `global-setup.ts`. No route was added
  to the API and production limits are unchanged.
- D6-06 StickyCTA hides only for controls that open a keyboard (text inputs,
  textarea, select). A checkbox or radio keeps focus after a tap and never
  needs the bar out of the way; treating every input the same was the bug.
- D6-07 One Confirm button per screen: the inline one on the review step was
  removed, leaving the sticky bar on phones and the summary card from 1024px.
  The done screen stops printing the raw manage URL; the email carries the
  link, and only a booking without an email shows a "save this manage link".
- D6-08 The phone hero keeps the 4:5 ratio in both states, so the box does not
  grow when the photo arrives (Home CLS 0.103 to 0 on the production build).
- D6-09 The manualBookings idempotency case now books a fixed open slot
  tomorrow instead of "seven hours from now"; the old value fell after closing
  when the suite ran late in the day.
- D6-10 The owner and barber guides are Markdown with phone screenshots taken
  on the e2e server by `tests/e2e/guide.ts` (never production). The PDF is
  rendered by `scripts/guide-pdf.ts` with Playwright from a small Markdown
  subset (headings, lists, bold, links, images) rather than a Markdown
  dependency: the guide uses nothing else and the renderer is forty lines.
- D6-11 Small buttons grew from 36 to 44px tall everywhere rather than only on
  touch screens, so the measurement in the audit script (a desktop Chromium)
  and the phone agree and the kit has one answer. The padding keeps the
  button slim; the kit API is unchanged.
- D6-12 The admin Today, Schedule and Photos layout shift numbers from the dev
  server are recorded as a dev artifact (lazy chunk CSS injected after the
  first paint there) and not fixed: the production build loads the chunk's
  stylesheet first and the sign-in page measures 0 there.

## Prompt 7: live without R2

- D7-01 The branch is `claude/p7-live-without-r2`, started from `main` after
  PR 1 merged, as the brief asks for a new branch and a new pull request.
- D7-02 `STORAGE_DRIVER=none` is a third driver value, not a missing R2
  variable treated leniently: the gate stays strict (`local` is still refused
  on Vercel), and production needs STORAGE_DISABLED_ACK=true, the same shape
  as EMAIL_DISABLED_ACK. Previews take `none` without an acknowledgement, as
  they take `log` email. Nothing else the gate blocks is optional: the
  database name, the https address and CRON_SECRET stay required.
- D7-03 Without storage every photo read returns nothing (hero null, no
  portraits, empty gallery, empty admin list) rather than records with no
  usable URL, because there is no public address to serve a file from. The
  records and objects stay, so switching R2 back on shows them again.
- D7-04 Upload routes answer 503 STORAGE_DISABLED from the service
  (`assertStorageEnabled` before any database write), not from the router, so
  the authorization matrix is unchanged: the routes still exist and still
  need a login.
- D7-05 The Photos screen learns about storage from `features.photos` on
  `/api/auth/me` rather than a new route or a public flag, because it is a
  deployment capability the signed-in dashboard already asks about itself.
- D7-06 The daily job skips the purge, the sweep, the backup and the prune as
  one block and reports `skipped: [...]` plus a warn log line, instead of
  letting each step fail with STORAGE_DISABLED: Vercel Cron only sees the
  status code, and the log line is what a person reads.
- D7-07 The doctor gets a Backups row (pass with storage, warn without) so the
  three things R2 turns on are named side by side with the one fix sentence.
- D7-08 `/api/health` answers 503 with `{ ok: false, status: "config",
missing: [names] }` while the gate refuses; `db` is left out because nothing
  is tried. To make that work with a missing MONGODB_URI, `describeEnv` and
  `getPartialEnv` read the environment without throwing, and the secret check,
  the setup status, the doctor and `currentEnvironment` use them. `getEnv`
  keeps throwing for everything else.
- D7-09 `/setup` no longer asks for `/api/shop` at all (the layout passes a null
  path on that route), which is simpler than special-casing the down state,
  and a missing shop settings document now answers 503 CONFIG_ERROR instead of
  500, since it is the same "not set up yet" condition.
- D7-10 Nav logo: two marks in the DOM with a width-based wrapper (wordmark at
  40px tall from 1024px, stacked at 48px below), instead of one wordmark sized
  for phones. The wrappers carry the display rule so the theme swap inside
  `Mark` keeps working; a class on the images themselves lost to the theme
  rule's specificity (seen in the first dark capture). The admin side nav uses
  the stacked mark. The active nav underline was fixed on the way: the rule
  targeted the anchor while the state lives on the span.
- D7-11 Route-change focus: a hook in both layouts focuses the page H1 one tick
  after the path changes, skips the first load (nothing is focused, so no
  ring), and steps aside when the page already placed focus inside main (the
  Book step headings). Headings with tabindex -1 never draw an outline; every
  control keeps `:focus-visible`. The Book step heading showed a ring on first
  paint before this, as the only programmatic focus before any interaction.
- D7-12 The sign-in page no longer probes `/api/auth/me` on a browser that
  never signed in: a localStorage hint set after a sign-in gates the probe,
  and a 401 or sign-out clears it. The known "two 401s in the console" gap is
  gone and the production-like run can assert zero console errors.
- D7-13 The production-like run is its own Playwright config and server script
  (`npm run test:e2e:prod`): it builds with vite, serves `dist` over https on
  127.0.0.1 with a self-signed certificate from openssl, applies the headers
  from vercel.json, sets exactly the DEPLOY.md variable list with NODE_ENV and
  VERCEL_ENV production, and spawns a twin on the next port without
  MONGODB_URI. https is needed because APP_BASE_URL must be https in production
  and the Origin check compares against it. `npm run test:e2e` runs the dev
  suite and then this one; CI keeps running Vitest only.
- D7-14 Short admin pages on phones sat below the fold: the admin grid gave its
  one `1fr` row to the empty header. Rows are now `auto 1fr` below 1024px.
  Found in the p7 captures, fixed as a small safe change.
- D7-15 The combined `docs/screens/p7/montage.png` is the four per-width
  montages stacked at half size, so it stays under the size of the rest of the
  folder.

## Prompt 8: showcase demo

- D8-01 The branch is `claude/p8-showcase-demo`, stacked on `claude/p7-live-without-r2`
  because PR 2 was not merged when this started and everything here builds on
  `STORAGE_DRIVER=none`, `/api/health` and the production-like run. The pull request
  targets `main` and contains PR 2's two commits until PR 2 merges.
- D8-02 Root cause of the down screen, reproduced from the code path with the variables
  Rob set: on `main`, `STORAGE_DRIVER` accepts only `local` and `r2`, so the value `none` fails
  the environment schema; `/api/shop` answers 500 INTERNAL_ERROR and `/api/health` answers
  degraded, and the layout shows the down screen. With PR 2's code the next cause is the empty
  database: no shop settings, so `/api/shop` answers 503 CONFIG_ERROR ("not set up yet") until
  setup runs. Demo mode removes that second cause; merging removes the first.
- D8-03 `DEMO_MODE` waives EMAIL_DISABLED_ACK and STORAGE_DISABLED_ACK in production: the
  switch already says "this is a showcase, no email and no real storage on purpose", and the
  brief wants the showcase to work with the six variables. It waives nothing else:
  MONGODB_DB_NAME, https APP_BASE_URL and CRON_SECRET stay required, and `local` is
  still refused on Vercel. `STORAGE_DRIVER=mongo` is accepted in production only with
  DEMO_MODE=true; previews may use it freely (they hold no real data).
- D8-04 Auto setup lives in the router (`assertServing`), not in a page or a cron: any route
  that is not `alwaysOn` triggers `ensureDemo()` before it answers, so the first request of any
  kind (a page's `/api/shop`, a direct API call) sets the shop up. It calls the existing
  `bootstrap()` with force; there is no second seeder. The lock is a `systemState` document
  with a unique `_id`: the insert is the atomic step, a lock older than 60 seconds is taken
  over by compare and swap, and losers poll until the settings exist (25 second limit, then
  CONFIG_ERROR). Process memory trusts "ready" for 60 seconds so a warm instance does not ask
  the database on every request.
- D8-05 In demo mode `bootstrap()` creates the owner with SEED_OWNER_PASSWORD when set, else a
  random password nobody needs: the demo sign-in button starts a normal session for the owner
  without one, so there is no shared default password to leak. The endpoint is rate limited
  per address (30 per 15 minutes) and audited like any sign-in.
- D8-06 Demo routes are flagged `demoOnly` and skipped by the router while matching when the
  mode is off, instead of throwing 404 from the handler: the answer is then byte for byte the
  one for an address that was never built. The handlers also assert the mode (defense in
  depth). The authorization matrix expects 404 for every role with the mode off and has a
  second pass with the mode on (owner last, because a reset deletes the other logins).
- D8-07 Sample bookings go through the real booking code (`createBooking` for online, the
  manual booking service for phone and walk-in), so every sample holds its slot locks and
  follows availability. Each sample picks the Nth day its chair is open (the seed hours close
  two days a week) and the first slot at or after its hour; availability is reloaded for each
  sample so earlier ones are in the way. A sample that cannot be placed is skipped with a log
  line, never fatal. Walk-ins are placed only while the chair is working, so Today never shows
  a walk-in at 3am. Names are obviously fictional and phones are +1215555 01XX.
- D8-08 "Reset demo data" wipes every business collection and the photo objects, deletes the
  non-owner logins and their sessions, clears the demo marker (which is what makes setup load the
  sample bookings again), runs `bootstrap()` and restores the run count. The owner login and the
  owner's session stay, so the person who pressed the button is not signed out. The page does a
  full load afterwards because every screen holds data that no longer exists.
- D8-09 Leaving the showcase is a deliberate, guarded step. `clearDemoData()` empties the whole
  database but only when the `demo` marker exists; `bootstrap()` refuses a marked database while
  DEMO_MODE is off. Both the /setup button (behind a checkbox and the setup secret) and
  `npm run demo:clear` call it. A real shop's data cannot be cleared by this route.
- D8-10 The `mongo` storage driver keeps images in GridFS (bucket `media`). The public id is
  the uuid inside the key (`<uuid>.webp`), so `/api/media/:id` needs no lookup table and the
  admin, the photos service and every public page are unchanged. Uploads PUT to the same site
  with a signed query string (the local driver's HMAC over key and expiry, five minutes), as
  `application/octet-stream` so Vercel hands the function the raw bytes; the route checks
  the signature, a 3 MB cap and the image magic bytes (the stored type comes from the bytes,
  never from the header). Confirm compares size and type exactly as for R2. Reads carry
  `max-age` and `s-maxage` of a year with `immutable`, because an id never changes.
- D8-11 The 3 MB limit is enforced by the server for `mongo` (413 at issue and at PUT) and the
  browser tries 2000px at three qualities, then 1600px and 1200px, until the WebP fits, so a
  large phone photo is shrunk instead of refused. That loop runs for every driver; only the
  limit differs.
- D8-12 Backups skip GridFS: with the mongo driver the daily job still purges deleted photos and
  sweeps abandoned uploads, logs that the backup was skipped and reports `skipped`. A backup
  written into the database it is backing up would back up nothing. The doctor shows Backups
  as Check and Public photo URL as OK (the site serves its own photos).
- D8-13 Not indexed, in four places, because Vercel serves the static HTML without running our
  code: an `X-Robots-Tag` header on every API answer; the robots meta tag set at runtime from
  `shop.demo`; and, when DEMO_MODE is set in the build environment, the same meta tag in the
  static `index.html` and a `Disallow: /` robots.txt. The header cannot cover the HTML shell
  without routing middleware, which cannot be tested here and could take the whole site down
  if wrong; DEPLOY.md says DEMO_MODE must be set before the build.
- D8-14 The booking done screen shows the manage link in demo mode (`shop.demo`), as a visible
  address, because no email goes out. Without demo mode nothing changed.
- D8-15 The down screen shows a Details disclosure with the error code only. `errorCodeOf`
  maps an API answer to its code, a non-JSON answer to INVALID_RESPONSE, a failed fetch to
  NETWORK_ERROR and a schema mismatch to UNEXPECTED_RESPONSE: kinds of failure, never values,
  messages or stacks. A test asserts the screen text carries no connection string or secret.
- D8-16 `docs/brand/BRAND.md` still does not exist (D6-02). The real marks are
  `public/brand/*.svg` from Rob's upload; every logo slot was checked against them: nav
  (wordmark from 1024px, stacked below), admin side nav (stacked), footer seal and hero primary
  and booking card wordmark (white, inside ink bands), and the admin sign-in page, which had
  no logo and now carries the stacked mark. The hero logo's width and height attributes had
  the wrong ratio and were corrected.
- D8-17 The hero was broken on phones and the earlier captures missed it: the 4:5 box was
  shorter than its words, so the title overflowed upward over the absolutely placed logo.
  The logo now sits in the flow above the words, in the page column, and the box has a floor
  (`min-height`) but no ceiling, with the same floor in the ink and photo states so the page
  still does not jump when the photo arrives (Home CLS 0, mobile performance 97).
- D8-18 The showcase has its own production-like run: `playwright.demo.config.ts` and
  `--profile=demo` on the same server script, which builds with DEMO_MODE, serves https on 4176
  and sets exactly MONGODB_URI, MONGODB_DB_NAME, APP_BASE_URL, MANAGE_LINK_SECRET, CRON_SECRET,
  DEMO_MODE and STORAGE_DRIVER=mongo on an empty database. The launch run (4174) proves the
  opposite with the mode off: not seeded, no demo button, 404s, no media route.

## Prompt 9: the function never loaded on Vercel

- D9-01 PR 3 (prompt 8) was not merged, so this branch is `claude/p9-vercel-function-fix`
  from `claude/p8-showcase-demo`. The pull request contains PR 2 and PR 3 until they merge.
- D9-02 The real root cause, reproduced exactly: Vercel compiles `api/[...path].ts` file by file
  and runs it with plain Node ESM, where `import '../server/http/app'` has no extension, so the
  function died with ERR_MODULE_NOT_FOUND before any of our code ran. Every earlier "root cause"
  (reports 05 to 08: missing R2 variables, STORAGE_DRIVER=none, an empty database) was a guess
  about code that never executed in production. They were reproduced under tsx, which resolves
  extensionless imports, so the reproductions proved nothing about Vercel.
- D9-03 Option A, one esbuild bundle. Option B (`.js` on every relative import in about 230
  files, NodeNext resolution, a lint rule) changes every file, fights the bundler-style
  resolution the app and tests use, and depends on Vercel compiling and tracing every file the
  way I hope it does. With a bundle there are no relative imports left to resolve, and the exact
  file that ships is the file the test runs.
- D9-04 The bundle is committed (`server/bundle/app.mjs`, 1.4 MB) behind a tiny hand-written
  `api/index.js`. Vercel finds functions from the repository's files and traces what they
  import; a file only the build command writes might not exist then. Committing it makes the
  shipped file independent of build order. `npm run build` regenerates it (so a stale copy
  cannot hide) and CI fails when the committed copy differs from a fresh build.
- D9-05 `api/index.js` is plain JavaScript with no imports of ours. It loads the bundle with a
  dynamic import inside the handler, so a load failure (a native add-on, a bad deploy) becomes
  JSON `FUNCTION_LOAD_FAILED` (503) instead of Vercel's FUNCTION_INVOCATION_FAILED page. A last
  catch in the bundle's own entry (`server/vercel-entry.ts`) answers JSON INTERNAL_ERROR for
  anything thrown outside the router. Neither answer carries the underlying message, which can
  hold paths or connection strings; both are logged with connection strings redacted. The code
  joined the shared error list so the down screen's Details shows it.
- D9-06 External packages: `mongodb` and `@node-rs/argon2` (native add-ons), resolved from
  node_modules by Vercel's tracer. Everything else is plain JavaScript and is bundled. `ws` is
  an optional peer that `@vercel/functions` imports lazily in `upgradeWebSocket`, which nothing
  calls. The build fails if a dev-only package (vite, vitest, tsx, mongodb-memory-server,
  esbuild, playwright) ends up in the bundle. The argon2 Linux x64 binary ships (verified in
  Vercel's own build output).
- D9-07 Second production bug, found by running Vercel's own `vercel build` and reading the
  routing table it generates: `api/[...path]` is routed as `^/api/([^/]+)$`, ONE path segment.
  `/api/health` and `/api/shop` would have worked; `/api/auth/login`, `/api/staff/marcus`,
  `/api/admin/*` and the cron path would have answered Vercel's 404. Fix: the function is
  `api/index.js` (the standard single-function layout) with the rewrite `/api/(.*)` to `/api`,
  which Vercel turns into `^/api(?:/(.*))$`. The router reads the original request path; the test
  also proves it ignores a query Vercel might add. `/sitemap.xml` still rewrites to
  `/api/sitemap.xml`, which the same rule then sends to the function.
- D9-08 Vercel's tracer packed `.data/uploads` (a developer's local uploads) into the function
  because the local storage driver wrote `resolve('.data', 'uploads')` as a literal. The path is
  now built at run time and `vercel.json` excludes `.data/**`; the test fails if either ships.
- D9-09 `npm run test:vercel-function` builds the bundle, then ships it two ways into temp
  directories holding nothing else (the files `@vercel/nft` traces from `api/index.js`, and the
  output of Vercel's own `vercel build`, which needs no token) and runs each with plain `node`
  through a bare HTTP server: no env gives JSON `{ ok: false, missing }`; the showcase env on an
  empty in-memory database gives auto setup, health, the shop, the demo sign-in, a GridFS upload
  and its public address; a deleted bundle gives JSON FUNCTION_LOAD_FAILED. It then replays
  Vercel's generated routing table for API and page paths of every depth. The Vercel CLI is run
  with `npx vercel@64.5.0`, not installed, to keep installs light; a stub `.vercel/project.json`
  (git-ignored) stands in for a linked project. CI sets REQUIRE_VERCEL_BUILD=1 so the step cannot
  quietly skip; locally it skips with a note if the CLI cannot be fetched.
- D9-10 The production-like e2e servers (launch and showcase) now load `api/index.js` and the
  bundle instead of the TypeScript router, so those 12 tests exercise the shipped function too.
- D9-11 Limits: nothing here can call Vercel itself, and the Vercel API refused this session
  (403), so the failed deployment's files could not be inspected; the fix rests on running the
  same builder and tracer locally. What is not proven: that Vercel's platform hands the
  function the original request path after a rewrite (the documented Express-on-Vercel pattern
  relies on it), which the first deploy's `/api/health` and `/api/staff/marcus` will confirm.

## Prompt 10: redesign, motion, phone bar, Cloudinary

- D10-01 Branch from main after PR 4 merged (main = 17fa43d), branch `claude/p10-shop-sign-redesign`.
- D10-02 The mockup board (`docs/brand/website/exq_site_mobile_board.png`) and `docs/brand/BRAND.md`
  are not in the repository, so the written brief is the source; it is saved as
  `docs/brand/DESIGN-DIRECTION-V2.md`.
- D10-03 Tokens follow the brief exactly, with three additions the brief did not list but needs:
  `--mute-on-dark` (#A8A8A8, 7.6:1 on ink, for gray text on ink because `--text-3` is only 3.5:1 on
  #111), `--hit` (44px tap target) and `--rule` (2px). `--t-display` uses `clamp(40px, 13.4vw, 52px)` so
  it is 52px from 385px wide and EXQUISITE (9 heavy caps) never clips on a 360px phone.
- D10-04 In dark, `--card-2` is `--ink-2`, not `--ink-3`: red text (#FF5470) on #333 is 4.1:1 and failed
  axe. Borders stay #333.
- D10-05 Button text is label size (13px, 600, caps, +14% tracking) everywhere, including the bottom
  bar: it is the only size in the scale that fits "CONFIRM BOOKING" in half of a 390px screen.
- D10-06 The dark theme keeps explicit values in two blocks (the attribute and the media query)
  instead of `light-dark()`, which iOS before 17.5 ignores; a missing declaration there would drop all
  colors on an older iPhone.
- D10-07 Every `transition` and `animation` lives in `motion.css`, inside
  `prefers-reduced-motion: no-preference`, so reduced motion is one switch and the rules are testable.
  The check mark draws with `stroke-dashoffset`, the one property besides transform, opacity and
  clip-path (the brief asks for it by name).
- D10-08 No animation library. Sheet drag-to-close is not built (a tap on the backdrop, the X and
  Escape close it); the lightbox swipes with CSS scroll snap, so nothing needed a library.
- D10-09 Toasts leave after 4s; a toast with an Undo action stays 7s so the action is usable (hover and
  focus pause both).
- D10-10 Dialogs are the native `<dialog>` with `@starting-style` and `allow-discrete` transitions.
  Browsers without them open and close instantly; content stays mounted for `--d-fast` so the exit
  does not show an empty box.
- D10-11 The announcement is stored as `{ enabled, text, linkLabel, linkUrl }` in shop settings
  (default "Walk ins welcome" with a "Book online" link to `/book`). Older settings documents get
  the default on read, so nothing needs a migration. The strip is an empty ink bar while shop data
  loads so the page does not shift.
- D10-12 The bar hides when a text field has focus or the visual viewport has shrunk by more than
  150px. Focus alone is what a desktop browser at phone width can show (the tests), and the viewport
  check is what iOS and Android report; together they cover both. The cost: with the keyboard up
  the bar is out of reach, so the last field is finished with the keyboard's own Go key (the form
  submits) or by closing the keyboard.
- D10-13 On the first booking step BACK links to the home page; on later steps it goes one step back
  with the choices kept. On the details step CONTINUE submits the form (the `form` attribute), so
  validation messages appear as before.
- D10-14 The bar's routes: hidden under `/admin`, `/setup`, `/kit` and `/portal`. Prompt 11's barber
  portal is not built yet; it should live under `/portal`, or add its prefix to `NO_BAR_PREFIXES`.
- D10-15 With JavaScript off nothing in a single page app can render, so `index.html` carries a
  `<noscript>` block: the name, the phone (from the seed, the same value the down screen uses) and
  the address. Every reveal is already visible by default, so a page that loses its script mid way is
  never left hidden.
- D10-16 Header is sticky on every width (the strip scrolls away), because the phone bar carries only
  Call and Book and the menu must stay reachable. The announcement strip is 40px, not thinner, so its
  link is a real tap target.
- D10-17 View transitions: the app uses the declarative BrowserRouter, whose `viewTransition` prop does
  nothing (only data routers honor it). Rather than change the router, the kit `Link` and `NavLink`
  take the click and run the navigation inside `document.startViewTransition` with `flushSync`. It is
  skipped for modified clicks, new-tab links, reduced motion and browsers without the API, so there is
  no fallback animation.
- D10-18 Reveals hide an element only after measuring it (below the fold, motion ready) and do it
  without a transition, so nothing fades out after first paint. A photo wipe clips the child, not the
  element the observer watches, because an element clipped away entirely never counts as on screen.
- D10-19 Home's right half stays empty on desktop when there is no hero photo. The text column keeps the
  same width either way, so a photo arriving after the shop data does not move the text (CLS).
- D10-20 The Menu on Home shows each service's description and duration (the mockup shows one line);
  on Services the group name sits over a 2px rule, as in the mockup.
- D10-21 The booking flow keeps its six URL steps (services, barber, day, time, details, confirm); the
  progress bar shows four parts and the bar's "time" part opens the times directly when a day is
  already chosen. Auto advance after picking a day or a time is unchanged, so CONTINUE is disabled on
  those steps until something is chosen.
- D10-22 The step slide is derived while rendering (travel direction from the previous step index) and
  the step is remounted by key, so the heading takes focus on every step as before.
- D10-23 Admin headings below the page title are sentence case, not caps, and the admin scale is 13, 15,
  18 and 22px: a dense working screen reads better that way. Everything else (tokens, the kit, the
  states) is shared with the public site.
- D10-24 Cloudinary is a driver behind the existing storage port. The port's `PresignedUpload` became a
  union (PUT for R2, local and GridFS; signed POST for Cloudinary), `uploadUrlResponse` gained
  `method: 'POST'` and `fields`, and confirm gained an optional `cloudinary: { publicId, version, bytes }`
  that is required, and checked against the Admin API, when the driver is Cloudinary.
- D10-25 A Cloudinary photo key is its public id, `<CLOUDINARY_FOLDER>/<uuid>`, the same uuid the old
  keys carried, so the migration is idempotent (the destination of a photo never changes) and a half
  finished copy is adopted on the next run. The old GridFS objects are left in place.
- D10-26 Backups: Cloudinary holds images, not the NDJSON export, so with this driver the daily job
  writes no backup (it logs that, like the GridFS case) and the doctor says to turn on Atlas backups.
  R2 stays available for anyone who wants bucket backups.
- D10-27 The CSP no longer allows any `https:` image: images from the site itself, data and
  `res.cloudinary.com`; connections to the site and `api.cloudinary.com`. An R2 deployment would need
  its public host added to `img-src`.
- D10-28 The doctor's Cloudinary check is a signed Admin API ping (nothing written), then reports
  delivery as OK without a network call. The 10 MB limit is enforced on issue and again on confirm.
- D10-29 The fake Cloudinary in the tests wraps `fetch` and checks the same signature and credentials
  the real service does, so a wrong signing rule fails the test instead of passing quietly.
