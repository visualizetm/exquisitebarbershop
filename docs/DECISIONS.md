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
- D10-30 Performance is measured on a build served with brotli, because Vercel compresses text and a
  plain Node server does not (73 to 76 uncompressed, 95 to 97 compressed). `scripts/prodlike-server.ts` now
  compresses so the local run matches what visitors get.
- D10-31 Screenshots and recordings were captured once, in the last milestone, from the dev e2e server
  with sample photos; earlier milestones were checked by eye with throwaway captures. Full page
  captures show the fixed phone bar mid page; that is the capture, not the layout.
- D10-32 `milestone 1` through `5` commits each passed typecheck, lint, format, unit tests, the three
  end to end suites, `test:vercel-function` and the build, except milestone 3, whose first commit
  carried two lint errors in the reveal hook and a test that were fixed in the next commit.

## Prompt 11: owner dashboard, barber PIN portal, demo notice, icons, social links

- D11-01 Branch base: PR 5 (brand v2) and PR 6 (prompt 10) were both still open, so this branch starts
  from the prompt 10 branch and merges the brand v2 branch (`brand/v2-final`, assets and docs only) so the
  new marks (`crest`, `disc`, `arched`, `lockup-vertical`) exist for the `Mark` fix. Merging either PR
  first only shrinks this diff.
- D11-02 Decisions given with the prompt: a barber's "I'm out today" never cancels anything, it creates
  an alert and the owner chooses per booking (Move, Keep, Cancel, Cancel and notify); barbers use one
  shared link, `/team`, a name then a six digit PIN; the owner stays on email and password at `/admin`
  and barbers can no longer sign in there.
- D11-03 Search is one endpoint, `GET /api/admin/search?q=`. A stored `nameKey` on each booking (the name
  without case and accents) with the index `{ nameKey: 1, startAt: -1 }` makes name prefix search use an
  index. Bookings written before the field existed are backfilled once per process on the first search.
  Phone search matches an exact number when ten digits are given and the end of the number otherwise;
  the end-of-number regex scans the `customer.phone` index only, which is fine at a shop's volume, so no
  extra field was added for it. A booking code matches exactly.
- D11-04 The shell puts the old `.exq-adm` element styles on the content area only, never on the sidebar,
  top bar or tab bar, so the old raw element styles (every `button`, `input`) cannot leak into the new kit.
  The old pages and forms keep them until each is rebuilt from the kit in a later milestone.
- D11-05 The bar chart is hand drawn SVG with a real table next to it for screen readers. The bars are
  not focusable (an `aria-hidden` focusable element fails axe); hover shows the values and the table is
  the keyboard and screen reader path.
- D11-06 `/kit` (development builds only) gained a Dashboard section with the new parts, and its test
  lists it.
- D11-07 The resolver gained Move on the server (it was listed for milestone 3 but milestone 2's quick
  actions already needed it). `moveOptions` on each affected booking lists chairs that do every service,
  work the whole duration and hold no lock over it. Applying a move releases the old locks and takes the
  same time on the new chair inside the change's transaction, so a booking made a moment earlier makes the
  lock insert fail and the whole change (time off included) is undone with SLOT_TAKEN. A test runs two
  changes racing for the same chair.
- D11-08 A move is silent: the time does not change, so the customer's manage link stays valid (no token
  version bump) and no email goes out. The owner can still choose Cancel and notify, or Resend confirmation
  from the booking panel. The alternative, an email on every move, would also have invalidated the
  customer's link.
- D11-09 Alerts are a collection (`alerts`, index `{ status, createdAt }`) with a repository and a count of
  still-affected bookings computed when the overview loads. A barber-out alert whose bookings have all been
  moved or cancelled closes itself on the next load. Alerts are created by the barber portal (milestone 5).
- D11-10 `GET /api/shop` is no longer cached for 60 seconds (`max-age=0, must-revalidate`) because Website
  changes must show right away. It is one small document read.
- D11-11 The booking panel opens from the address only on the bookings pages (`/admin/bookings/:id` over the
  list, back button closes it). From the overview, the schedule and the search it is plain state, so those
  pages keep their own address.
- D11-12 Booking status chips say Confirmed, Done, No show and Cancelled (the API value stays `completed`).
- D11-13 The legacy element rules in `admin.css` (every `button`, `ul`) now apply only to unclassed
  elements and `exq-adm-*` classes, so kit parts inside the dashboard are never restyled by them. They go
  when the last old page is rebuilt.
- D11-14 Announcement text is up to 90 characters and may have a last day (`endsOn`); the public API
  switches it off after that day. Social links are three optional https URLs checked against the network's
  own host (`social` in shop settings), seeded with Instagram only.
- D11-15 Customers are keyed by normalized phone, grouped from bookings in the database (no customers
  collection); "visits" counts completed bookings, "last visit" the latest completed one, "usual barber" the
  chair with the most non-cancelled bookings. The owner's private note lives in `customerNotes` (unique on
  phone) and is only reachable through owner routes; an emptied note is deleted.
- D11-16 A removed barber's address answers `410 STAFF_REMOVED` (a name that never existed stays 404): the
  profile page then redirects to `/book?barber=any` and a QR link to `/book?barber=<slug>` falls back to
  "anyone available". A renamed slug keeps resolving to the current profile through the alias list.
- D11-17 The public content routes (shop, services, staff, staff profile, gallery) revalidate on every
  request instead of caching for 30 to 60 seconds, so Website and Team edits show right away. Availability
  keeps its 10 to 30 second cache because it is per browser and has no owner edit to wait for.
- D11-18 An alert is resolved through the same conflict flow as any schedule change: the first request without
  choices answers 409 with the affected bookings and the chairs each could move to, the second applies all
  choices and closes the alert in the same transaction. A time off request is approved by creating the time
  off with those choices; declining just closes it.
- D11-19 The schedule day grid is plain absolutely positioned blocks in a CSS grid (no library, no dragging).
  Empty slots are clickable for a pointer, and each chair header has a New booking button for the keyboard.
  The red now line only draws on today's grid and inside the shown hours.
- D11-20 Settings saves the whole settings document, so a field with no control on the new Settings page
  (the per-phone booking limit, cleanup minutes, start time step, most services per booking, the barber
  permissions) keeps the value it has. Rob can still change them through the API; the owner guide only
  promises what the page shows. Less to build and verify, and none of them was in the prompt 11 list.
- D11-21 One "cancel or reschedule until N hours before" control writes both cutoff minutes. If the value is
  not touched on save, each keeps what it had, so saving other rules never flattens a split setting.
- D11-22 Replacing the home photo uploads the new one first and only then removes the old ones, so a failed
  upload never leaves the home page without a photo. Gallery uploads go one by one so one bad file does not
  stop the rest; a failed one stays in the list with the reason.
- D11-23 "View on site" is one link in the Website page header that follows the open tab (Hours opens Visit,
  Services opens Services, Gallery opens Gallery, Announcement and Home photo open Home), always in a new
  tab. The Overview quick action sheet keeps its own button.
- D11-24 The sign-in email is changed with the current password and a new `POST /api/me/email`; it keeps
  every session (the owner is the one asking) and is audited. A duplicate email answers 409.
- D11-25 Removed pages: Settings (Services, Staff, Hours, Closures, Shop settings, Demo data) and the Photos
  page. `/admin/photos` redirects to Website, Gallery; `/admin/account` to Settings, Account; the old
  `/admin/settings/*` addresses to Settings. Barber logins (`settings/logins`) stay until the PIN portal
  replaces them.
- D11-26 A toast that appears under a resting pointer was being dismissed at once (the pointer entered it
  before its clock started, which set the time left to zero). The pause now only acts on a running clock.
  The e2e booking helper clears the test server's rate-limit windows before each booking, because a full
  run books more than ten times from one address, which the real limit refuses by design.
- D11-27 A barber has no login record. Identity is the staff record plus a PIN, in three new collections:
  `staffPins` (one per barber, unique on `staffId`), `setupTokens` (hash only, TTL on `expiresAt`) and
  `teamSessions` (hash only, TTL on `expiresAt`, 12 hours absolute). The barber cookie is `__Host-exq_team`,
  separate from the owner's, and the router has a new auth level `team` next to `owner`. The two never stand
  in for each other: an owner route reads only the owner cookie and answers 401 to a barber session, and
  the other way round. The old barber email login is refused at `/admin` with a pointer to `/team` (only
  after the right password, so it reveals nothing), a barber login record can no longer authenticate, and
  the barber routes under `/api/me/*`, the `/api/admin/users*` routes and their screens are gone.
- D11-28 The PIN is stored as argon2id of an HMAC-SHA256 of the PIN keyed with `MANAGE_LINK_SECRET` and the
  staff id. Six digits are only a million guesses, so the hash alone would fall to an offline attack in
  minutes if the database leaked; the keyed digest means the database alone is not enough. Security wins
  over convenience here (decision rule), and it needs no new variable.
- D11-29 The five-tries lock reuses `loginThrottle` under a hashed `pin:<staffId>` key with one 15 minute
  level, and the thirty-per-address limit reuses `rateLimits`. Only failures count and a success clears the
  barber's count. Wrong PIN, no PIN yet, hidden barber and unknown id all answer the same `INVALID_CREDENTIALS`
  after the same hashing work; an unknown id only counts against the address, never against a barber. The
  one place the answer differs is the lock itself (`ACCOUNT_LOCKED`), because a real barber has to know to
  wait; that costs nothing the roster does not already show.
- D11-30 A setup link and "Reset PIN" are one operation: issuing a link deletes the PIN, ends every session
  of that barber, retires earlier links and clears a lock, so "a new link or reset invalidates the old PIN"
  holds by construction. "Copy setup link" is the same call without a confirmation; "Reset PIN" asks first.
  Using a link also signs the barber in, since holding the link is proof enough and typing the PIN twice is
  the only step left.
- D11-31 `barbersCanBlockTime` and `barbersCanUploadPhotos` no longer gate anything. Every barber can block
  their own time and ask for days off, which the portal needs to work out of the box, and photos stay with the
  owner (the Me tab says to ask). The flags remain in the stored settings document, unused, with no control.
- D11-32 "I'm out today" sets the day off, keeps every booked client exactly where they are and raises one
  `barberOut` alert when anyone was booked; pressing it twice changes nothing and raises nothing more. Days off
  ahead apply at once when those days are empty and otherwise become a `timeOffRequest` alert. A short block
  over a booked client is refused with the usual conflict answer, and the screen tells the barber to call the
  shop, because a barber may keep but never cancel or move a client.
- D11-33 What a barber sees of a booking is the first and last name as booked, the services, the time, the
  status and notes. Never a phone number or an email (a test asserts neither appears in any portal payload);
  "Call shop" replaces them. The walk-in form takes a phone number as input only, because a booking needs
  one for the owner's customer list.
- D11-34 In demo mode every seeded barber gets PIN 246810 when the shop is first set up, and a demo seeded
  before PINs existed gets them once, only while no PIN and no setup link exist at all. The sign-in screen
  prints "Demo PIN: 246810" only when the public shop says it is a demo, and e2e proves it is absent in the
  normal build.
- D11-35 Admin type stays 13 to 22px: PIN keys and stat values are now `--t-h3`. The portal page uses
  `--card-2` rather than `--surface-2`, because `--surface-2` is a light-only value and white text on it
  failed contrast in dark.
- D11-36 The demo notice is a blocking modal shown once per browser session on the public site, `/admin` and
  `/team` of a demo build only. The flag lives in `sessionStorage` behind try/catch; when storage is
  unavailable the notice shows every time rather than never. It traps focus, makes the page behind it inert
  and closes on Escape and on "Enter the demo". Afterwards a quiet "Demo by Visualize Studio" line sits in the
  footer. A real shop never mounts it (e2e proves no dialog on any page of the normal build).
- D11-37 `SocialIcon` is the one logged exception to "icons only from Untitled UI": Untitled UI has no brand
  glyphs, and a text link reading "Instagram" is not the recognizable control a customer looks for. It is
  three small line drawings in `currentColor`, aria-hidden, inside a link that carries the accessible name
  ("Exquisite on Instagram"), a 44px target and `rel="noopener"`. A network shows only when its URL is set in
  Settings. Nothing else outside Untitled UI is allowed.
- D11-38 Icon rules: never on a heading, at most one per button, always aria-hidden next to a text label; an
  icon-only button gets an `aria-label` and the desktop tooltip. Step bar ticks add "(done)" to the hidden
  text so the tick is not the only signal.
- D11-39 When the API is down, a public page keeps its words, bottom bar and footer and shows an inline
  notice with the shop's phone number; each data section says what did not load ("The menu did not load")
  instead of an empty block. Only `/book` and `/manage` (which cannot work without the database) and
  maintenance mode still replace the page with the full down screen.
- D11-40 The confirmation ticket splits the old "When" row into Day and Time, each with its own icon, so a
  screen reader reads two short facts and the time can be scanned at a glance.
- D11-41 The phone header logo is 170 by 40px: it filled the row at 360 and 390 before, pushing the menu
  button to the edge. A test asserts the box and that nothing scrolls sideways at both widths.
- D11-42 `Mark` variants: the footer uses `crest` (a seal reads as a stamp on dark), the `/team` sign-in uses
  `disc`. The lockups stay in the header only.
- D11-43 The capture script resets the demo data (the demo reset route) before every run, because the demo
  database outlives a server restart and earlier runs leave all-day hours behind that would show on the public
  pages.

## Prompt 12: real shop content

- D12-01 Address: `3309 Edgmont Ave, Suite F, Brookhaven, PA 19015`. The ZIP is confirmed. Google and Drew's
  booking page say Suite F, Dontrise's Squire page says "Unit 4". Suite F wins until Dontrise says otherwise.
- D12-02 Phone: `(610) 609-0786`, from the Google Business Profile. The owner's personal text line for Sunday
  appointments (listed in `docs/content/exquisite-site-data.json`) is never published: it is in no seed
  value, no page and no email. A test asserts it is absent from every public answer and from the home page
  source. This file does not repeat the number because the repository is public.
- D12-03 The shop email stays a PLACEHOLDER and no public page shows it. The check is `isPlaceholderEmail` in
  `shared/lib/email.ts`, which compares with the one stand-in address. `/api/shop` then sends an empty email,
  the Visit page drops its Mail line, the JSON-LD leaves `email` out and the calendar file carries no
  `ORGANIZER` line. A `showEmail` flag was rejected: it needs a settings field, an editor and a migration,
  and the check turns itself off the moment Dontrise types a real address in Settings. The owner's own
  settings screen still shows the stored value.
- D12-04 Hours come from the Google Business Profile: Monday closed, Tuesday to Sunday 10:00 to 19:00. They
  stay editable in the dashboard. Instagram posts and Dontrise's Squire page hint at other walk-in days and a
  Sunday deposit, so the hours are an open question for Dontrise. Drew works Tuesday to Saturday, 10:00 to
  18:00, from his own theCut schedule. Lee, Nelly and Dontrise use the shop hours (PLACEHOLDER). Iniya has no
  online hours at all.
- D12-05 The announcement is on with "Walk-ins welcome" and a "Book online" link to `/book`. The hyphen is
  used everywhere the phrase appears (the strip, the default, the hero fact, the Visit policy list and the
  no-script text), so the site never says it two ways.
- D12-06 New settings field `google`: `{ placeId, rating, reviewCount, ratingCheckedOn }`. It is validated by
  zod (at most one decimal, 0 to 5, a whole review count, a date or empty, a place id of letters, digits,
  hyphens and underscores), defaults to "not set" so a settings document saved earlier still reads, and is
  served on `/api/shop`. A count above zero needs a rating of at least 1. The rating is copied by hand from
  the profile (Google has no free feed) and the owner edits it in Website, Reviews in milestone 4.
- D12-07 The Maps and write-a-review links are built from the place id in `shared/lib/google.ts`. Every
  Directions button (Home and Visit are the only two) uses the Maps link. With no place id set, Directions
  falls back to a Maps search for the address instead of vanishing; the prompt says the link "replaces" the
  search link, and this keeps that true whenever a place id exists.
- D12-08 The JSON-LD stays a `BarberShop` with the phone, the address including Suite F, an
  `openingHoursSpecification` per open range and `sameAs` from the Instagram URL in the social links (TikTok
  and Facebook are added only when set). There is no `aggregateRating`: Google ignores self-served review
  markup for a local business, the rating on the page is typed in by hand, and marking it up invites a manual
  action for no gain. A test asserts the output contains no rating markup.
- D12-09 The team is the owner plus four: Dontrise, Lee, Drew, Nelly Cutz and Iniya, with chairs 1 to 5 in
  that order (PLACEHOLDER, the real chair numbers are unknown). Nelly is shown as "Nelly Cutz"; his theCut
  reviews call him "Mike", and only the name he lists is used. Lee's bio and services are PLACEHOLDER because
  no public menu or profile text was found; his services use the shop prices. A review calls Lee "the
  owner", which conflicts with the brief, so Dontrise stays the owner and Lee is a barber until Dontrise says
  how he wants it shown.
- D12-10 Iniya is on the website (`showOnWebsite: true`) with `acceptsOnlineBooking: false` and no services.
  The engine already skipped her: `staffQualifies` needs the flag, so first available, the booking picker
  and named availability never include her, even when her menu is filled in (a test proves it). What was
  missing is the client: her card said "Off today" (she has no hours here), the Home card linked to a booking
  page that cannot book her, `/book?barber=iniya` ended on an empty calendar, and her page said "Walk-ins
  only". Now her card says "Book through Instagram"; on Home it opens her Instagram in a new tab, on the
  chairs page it opens her page; her page has a "Book through Instagram" button; `/book?barber=iniya` moves
  to "Anyone available". The phone bottom bar keeps the shop-wide CALL and BOOK NOW on her page, because
  that is booking with the shop, not with her. The availability API still answers 200 with
  `noQualifiedStaff` for her slug (an existing contract), and a booking is refused with `STAFF_UNAVAILABLE`.
- D12-11 `/chairs/iniya` stays in the sitemap. It is a real page with her title, bio and a working link to
  where she books. Hiding it would need a new filter and would drop a page that has a purpose. The sitemap
  test proves it is listed.
- D12-12 The 15 services are the ones in Dontrise's Squire menu and Drew's and Nelly's theCut menus, at the
  prices and times in the prompt; each barber's `serviceIds` is the "who" column. The five made up beauty
  services are gone and there is no braids service (Iniya's, no public price). Female Haircut has an empty
  description because the menu gave none. Service ids come from the key, so `lineup` and `kids-cut` keep the
  ids they had. Until milestone 2 every chair shows the shop price, including where a barber charges more.
- D12-13 `runSeed` never overwrites, so a database seeded before this prompt keeps the old shop and barbers
  until Settings, Demo data, Reset runs on it. The report and DEPLOY.md say so.
- D12-14 The demo sample bookings were re-planned on the real barbers and services (Dontrise, Lee, Drew and
  Nelly; Iniya takes none). Days are counted as open days for that chair, so Monday and Drew's Sunday are
  skipped on their own.
- D12-15 The no-script text in `index.html` takes the address from the seed at build time (`%SHOP_ADDRESS%`),
  the way it already took the phone, instead of repeating it by hand.
- D12-16 Test migration: marcus became lee, dee drew, tre nelly. Jay became iniya where only a PIN or a
  removal mattered (she cannot be booked) and dontrise or nelly where a booking was needed; kris became
  dontrise or nelly the same way. Classic Cut (30 min, $30) became Haircut (45 min, $40), so lock counts and
  totals were recomputed, and Silk Press (beauty, owner only) became Female Haircut. Sunday is a working day
  now and Monday is closed, so "closed day" tests use Monday and a barber's day off is Drew's Sunday. The
  end to end tests pick the service with `/^Haircut(?! and| with)/` because the name starts two others.
- D12-17 The end to end team page test turns Dontrise's chair off for the day, so the random walk-in chair in
  the dashboard test no longer includes him.
- D12-18 `docs/content/exquisite-site-data.json` and `seed/photos/manifest.json` are listed in
  `.prettierignore`. They arrived as delivered data, `npm run format:check` failed on both, and rewriting
  the whitespace of the source of truth would only make its history harder to read.
- D12-19 The owner's New booking panel and the barber's walk-in form list only the services the chosen chair
  offers (the panel lists all of them for "first available"). With one shared menu that did not matter; now
  that Nelly does three services and Iniya none, a click on a service the chair cannot do would end in a
  refusal. A chair with no services says so instead of showing an empty box.
- D12-20 Review fix-up for M1, public booking. A chair chosen before the services (`/book?barber=<slug>` from
  a printed card, a Lightbox credit or the Book button on a chair page) now lists only that chair's menu, as
  the owner panel and the walk-in form already did (D12-19); picking Eyebrows after choosing Nelly used to
  end on "Nothing is open in the next 31 days". A line says "Showing what Nelly Cutz offers." with a "See
  every service" button, which sets the chair to anyone available and keeps the chosen services. The
  alternative, routing to the chair step when the chosen services do not fit, was rejected: that step cannot
  be reached before any service is chosen, and it would drop the chair the customer came for without a word.
  A chair that takes online bookings but has an empty menu is treated like Iniya: `/book?barber=` that chair
  moves to anyone available. The three pickers share `offeredServices` in `src/lib/booking/offered.ts`
  (its own file so the node type check, which has no JSX setting, can import it from a test).
- D12-21 Review fix-up, address in the calendar file. The "Add to calendar" download on the confirmation page
  now puts Suite F in LOCATION, like the emailed file, through `addressLine` in `src/lib/shop.ts`, which the
  Visit and Home meta descriptions use too. The short "Find us" fact in the Home hero stays street only: it
  is a compact label and the full address with the suite sits in the same section.
- D12-22 Review fix-up, settings save. The `PUT /api/admin/settings` request schema
  (`shopSettingsUpdateSchema`) makes `google` optional, and `updateShopSettings` leaves a group the save
  does not carry as it is. Before, a dashboard tab opened before a deploy (its response schema strips the
  unknown `google` key) would save the settings back without it and reset the place id and the rating to
  empty. The audit entry now records the settings as stored after the save. A group added after launch
  follows the same rule, so `reviews` in milestone 4 must be optional on the request in the same way.
- D12-23 Review fix-up, small things. Iniya's page title and description no longer promise "next openings";
  `chairDescription` in `src/lib/seo.ts` ends with her away label ("Book through Instagram."). The
  new-tab Instagram links (the chair card and the button on her page) say "opens in a new tab" to screen
  readers; the card's label used to drop that when it had a status. The Kit's disabled sample option is
  Hot Towel and Steam at $20 instead of the old made up shave.
- D12-24 "Takes online bookings" is a general switch, not an Iniya special case: any chair with it off shows
  "Book through Instagram" when it has a handle and "Walk-ins only" when it has none, and is left out of
  online booking and first available. The checkbox in Team, Profile now says so, and the owner guide too.
- D12-25 Review claims checked and left as they are. (a) The sitemap keeps `/chairs/iniya` (D12-11): the
  prompt's "skip her cleanly" is read as "without errors" for the sitemap, because her page is a real public
  page with a working link to where she books; excluding her needs one filter and one changed test if the
  lead reads it the other way. (b) The emailed calendar file has no `ORGANIZER` line while the shop email is
  the placeholder (D12-03): a stand-in address would be an invented mailbox, the state ends the moment
  Dontrise types a real address in Settings, and no calendar client was tested either way. (c) The personal
  number stays out of every file this prompt wrote; the tests that assert its absence match a short
  fragment, and the lead's data file still carries it.
- D12-26 Where the overrides live: `staff.servicePrices`, an optional array of `{serviceId, priceCents,
durationMinutes?}` on the staff document. Rejected: a separate prices collection (one more join on every
  availability load, and the editor, the public page and the booking all work per person) and a map on the
  service (the owner edits one person at a time). The field is optional so documents written before it read
  as none: `toStaffView`, `toPublicStaff` and the engine default it to an empty list, and no migration runs.
- D12-27 The pricing rule is one pure helper, `shared/lib/servicePricing.ts`. A chosen or assigned person
  gets their own entry, else the shop's price and time. The "from" flag first stayed the service's own flag for one
  person too; replaced by D12-82: one person's price is exact, and "from" is only for the shop-wide list and
  first available, where it is switched on by the service flag or when the people differ. An entry that cannot
  be a price (negative, a fraction of a cent, not a number) is ignored and the shop price applies, so a
  damaged record never charges nonsense; writes are validated, so this only guards against hand edits.
- D12-28 First available, or no one chosen yet: the lowest total among the people who do every chosen
  service, not the sum of each service's cheapest person (one barber has to do them all). A tie goes to the
  shorter time, then to display order. The matching duration decision: the time shown with a "from" price is
  that same person's time, so the price and the minutes always describe one real person ("From $20, 20 min"
  is Drew's lineup, not an average). Rejected: the shortest time of anyone (it would print minutes the
  cheapest person does not take) and the longest (it would scare customers off). The real price and time are
  fixed when a chair is assigned.
- D12-29 Two pools. The price list (Home, Services) draws from everyone on the site who offers the service,
  because a walk-in pays that price too. The booking steps and the owner's New booking panel draw first
  available from the chairs that take online bookings, which is the pool the server assigns from, so a
  "from" figure can only be too low by the spread between those chairs, never by a chair that cannot be
  booked.
- D12-30 The availability engine quotes per chair. `AvailabilityResult.quotes` (a map by staff id, price
  included) replaces the single `serviceMinutes`, `bufferMinutes` and `totalMinutes`: a start is offered to
  a chair only if that chair's own time fits before closing, and `OpenSlot.endAt` is measured for the chair
  the slot goes to (each candidate keeps its own length, and placement reads the chosen chair's quote). The
  cleanup gap stays per service and shop wide, not per person. `/api/availability` reports the shortest
  chair total as `durationMinutes` (nothing on the client reads it). Next openings and a chair's openings
  use the chair's own times, and a chair's measuring service is its shortest by those times.
- D12-31 Online, phone and walk-in bookings store the quote of the chair the booking lands on: the service
  lines (price, "from" flag, minutes), `durationMinutes`, `totalPriceCents` and the locks. That holds for
  first available too, where the chair is only known at placement. Emails, the ticket, the manage page, the
  admin views and the totals on the dashboard all read the stored snapshot, so none of them needed to
  change.
- D12-32 Reschedule. On the same chair the booking keeps what it was booked with: price, service lines and
  length. The engine request takes `keep` (that chair's stored minutes), so the times offered match what is
  locked even if the chair's time was edited afterwards. A move to another chair (the owner's reschedule
  with a chair, or anyone available) re-resolves with the new chair's own price and time and writes the
  service lines, `durationMinutes` and `totalPriceCents`, because keeping the old chair's price on a booking
  now sitting with Nelly would be wrong. Rejected: always re-resolving (an edit to a price would silently
  change an existing customer's price and length). The resolver Move (a schedule conflict) first kept price and
  length; replaced by D12-81, which reprices it for the new chair like any other move.
- D12-33 Validation. Cents are whole and not below zero, minutes use the service rule (multiple of 5, 5 to
  480; `serviceDurationSchema` is shared), at most 100 entries, one per service. Duplicates are an array
  level refinement, because Zod 4 refuses `.omit()` on an object with refinements and the staff schemas are
  derived with `.omit()`. For the same reason "only for a service on the menu" is a refinement on the create
  and update request schemas (when a request carries both halves) plus `staffRepo.assertPricesMatchMenu`,
  which `insertStaff` and `adminCatalog.updateStaff` run against the menu the chair will have afterwards, so
  a request with only one half is checked against the stored other half.
- D12-34 Taking a service off a barber's menu drops that service's price in the same save when the request
  carries no prices. Rejected: refusing the save (the owner would have to clear the price on another tab
  first) and keeping the entry (adding the service back later would silently revive an old price).
- D12-35 Audit. A price change writes its own `staff.prices.update` entry with the list before and after,
  because the existing `staff.update` entry records only the patch. It is written only when the list
  changed, so saving the same list twice leaves one entry.
- D12-36 The Team, Prices editor. An empty price means the shop price and an empty time means the shop time.
  A time with no price stores the shop's current price with it, because the schema needs a price. A price
  typed equal to the shop's is kept, since the owner may want a barber's price to stay put when the shop
  price moves. The editor is props driven (`staffName`, `services`, `saved`, `onSave`) so `/kit` shows every
  state with fake saves, and `PricesTab` does the PATCH, the toast and the refresh. "Use shop price" only
  appears on a group that holds a value, instead of ten disabled buttons.
- D12-37 Client. `src/lib/menuPrices.ts` (`menuServices`, `chairServices`, `bookingQuote`) hands back
  `PublicService` objects with the price, "from" flag and minutes already resolved, so `PriceRow`,
  `ServicePicker`, `BookingSummary` and `BookingCard` stayed as they were; `ServicePicker` gained an
  optional totals prop and `StaffPicker` shows what the chosen services come to with each person.
  `/api/services` stays at shop level and `/api/staff` carries `servicePrices`; the numbers are the ones
  printed on the pages, so nothing private travels. The owner's New booking panel and the barber walk-in
  form price the services for the chosen chair.
- D12-38 Bookings made before this change keep their stored cents: nothing recomputes a stored price, and
  the revenue, spent and total figures on the dashboard sum the stored totals. Staff documents without the
  field book at the shop price.
- D12-39 Two test fixes that were not about prices. The team spec's "In or Off" test now keeps the bookings
  an earlier test left on that chair today, because the shop is open on Sundays now and the resolver asks
  first. The availability unit tests select a chair by id, since two fixture chairs created in the same
  hours get the same generated slug.
- D12-40 Databases that were seeded before this change keep their staff as they are (`runSeed` never
  overwrites), so they have no per barber prices until the owner enters them in Team, Prices or runs Demo
  data, Reset, which wipes and reloads the seed with the overrides. Said in the report next to the other
  post deploy step.
- D12-41 Seed photo sizes without a dependency: a 30 line WebP header reader (`server/lib/webpSize.ts`, lossy
  VP8, lossless VP8L and extended VP8X) gives width and height. Rejected: sharp or image-size (a new
  dependency, and sharp is native and heavy in a Vercel function) and ImageMagick (not on Vercel). Every
  manifest file is WebP; a file that is not is reported and skipped.
- D12-42 Seed photo idempotency by a deterministic id: `_id = seedId('photo', file)`, the helper staff and
  services already use, so there is no `sourceKey` field. A run skips every file whose record exists, deleted
  or not, so a seed photo the owner deleted stays deleted, and the hero entry is skipped while any hero
  exists, so a home photo the owner chose wins. Rejected: a `sourceKey` field (a schema field and a lookup
  for the same result).
- D12-43 Seed photo object keys: the uuid in the key is derived from the database name, the file name and the
  bytes. Running again after a crash rewrites the same object instead of leaving an orphan; two deployments
  sharing a bucket never share an object (a demo reset can never delete production's photo); a file replaced
  under the same name gets a new address, so the year long immutable media cache never serves the old
  picture. Rejected: random uuids (an orphan per crash) and a uuid from the file name alone (shared across
  deployments).
- D12-44 A manifest entry whose file is missing is skipped with one warning per run that names every missing
  file; nothing throws for a missing file. A missing or invalid manifest is one warning and nothing loaded;
  with STORAGE_DRIVER=none the loader does nothing. Demo setup and reset always finish. The milestone was
  started with 3 of 16 files present; the lead added the rest while it was built (a83d278) and dropped
  exq-15 as a copy of exq-12 (b25a294), so all 15 manifest files exist now and the warning is silent.
- D12-45 Where the loader runs: in bootstrap's demo branch, which both the first visit setup and Demo data,
  Reset go through, plus `npm run photos:seed` for a real launch. Rejected: a per request check like the
  demo PINs one (the live showcase needs a Reset for the new team and prices anyway, and it would cost a
  query a minute). A run that added photos writes one `photo.seed` audit entry. SEED_PHOTOS_DIR points the
  loader at another folder (tests and fixture captures); it is read from the process environment like
  EXQ_LOCAL_UPLOADS_DIR, not the validated env schema, since no deployment sets it.
- D12-46 Server side photo writes go through one helper, `storePhotoBytes`: a plain `put` for R2, the local
  disk and GridFS, and the signed upload form posted from the server for Cloudinary (whose `put` refuses).
  `photos:migrate` now uses it too instead of its own copy.
- D12-47 The photos reach the Vercel function through `includeFiles` (`{server/bundle/**,seed/photos/**}`)
  and are read from `process.cwd()/seed/photos` at run time, so adding a photo needs no bundle rebuild.
  Rejected: embedding the WebPs in the esbuild bundle (the committed bundle would grow by every photo, and a
  missing file would break the build). `test:vercel-function` copies the `includeFiles` set into the nft
  shape (nft does not trace data files), lets the photos and the manifest past the "no loose source" check
  in both shapes, and proves the demo setup serves `exq-01-hero.webp` byte for byte.
- D12-48 The Home pick is an optional `home` flag on the photo record, set from the manifest.
  `/api/gallery?home=true` returns the picked photos first, in manifest order, then the rest of the gallery,
  so Home still fills from photos the owner uploads. With every photo delivered (15 since b25a294) that is
  exactly the six marked photos (exq-02, 03, 05, 09, 10, 14). Rejected: returning only marked photos (a launch without the seed would never show its uploaded
  work on Home). The owner cannot change the pick yet; deleting or adding photos is the lever for now.
- D12-49 Home's "the work" renders with at least three photos and shows one row of three (three to five
  photos) or the full six, so the grid never ends on a half row. With the 15 delivered photos Home shows the
  six marked ones; the minimum covers a shop with fewer photos (a real launch before photos:seed). A work grid
  of exactly three photos is one row of three at every width.
- D12-50 A chair page's work strip shows the photos credited to that chair; with none, up to three shop
  photos in Home order under the label "From the shop" with a "See the gallery" link; with no shop photos,
  no section. A shop photo credited to another barber may appear there (the lightbox names whose work it
  is); rejected a separate uncredited only query. Iniya's page gets the same strip.
- D12-51 Gallery needed no change: the barber filter chips already render only when a photo is credited to a
  public chair, so with the seed (nobody credited) they stay hidden and come back with the first credit.
- D12-52 With a photo, the Home hero is an ink band (`.exq-dark`). Below 1024px the photo fills the hero
  behind the text under a new token, `--scrim-photo` (ink at 80%): over a pure white photo white text keeps
  10.2:1, `--line` 7.2:1 and the red display line 3.3:1 (large text), and the 13px red labels turn white on
  the photo. From 1024px the photo sits in its own 4:5 column with no scrim. The text sets the height, so
  the title and the BOOK action stay in the first screen and nothing shifts when the photo loads. Rejected:
  a gradient scrim (the copy rules allow one gradient, the placeholder stripe) and a photo band above the
  text (it pushes BOOK below the first screen at 390). The hero photo is no longer wrapped in a reveal, so
  the LCP image is never clipped. Checked in screenshots in milestone 5 (no Playwright in this milestone).
- D12-53 Crops: the hero uses `object-position: 85% 30%` (both faces in exq-01 sit in the upper right) and
  gallery tiles `50% 35%` (head and cut sit in the upper middle of a portrait photo); a contact sheet of
  the square crops of all 15 delivered photos keeps every face and cut. Rejected: a per photo focal point
  (a schema field, the API and an admin control); revisit if a later photo crops badly. Tile `sizes` now say 33vw from 768px, where the grid has three columns.
- D12-54 Visit gets no storefront photo slot: none was delivered, and a placeholder would look like one. Open
  item for Dontrise: a storefront photo.
- D12-55 Barber pole check: `scripts/brand-assets.ts` reads only the v2 marks, and `public/` holds the Q
  icon, the v2 emblems, the OG card and the favicons; no file draws a barber pole (the old `exq-pole` files
  were deleted in 32dbf82). Nothing to remove.
- D12-56 Where the reviews live: `settings.reviews`, `{ enabled, items }`, on the shop settings document as
  the prompt says, at most 30 items, text up to 600 characters. A stored review carries `staffId`, resolved
  from the seed's `staffKey` with `staffSeedId`, not the key itself: the public API and the chair pages
  match on ids like every other reference, and the key only exists in `seed/shop.ts`. Rejected: a reviews
  collection (another repo, index, wipe step and route for at most 30 rows that are read with the settings).
- D12-57 Review ids come from `newId()` when the seed module loads (the task names newId), so they are 24 hex
  like every id. They are fixed once the settings document is created (`$setOnInsert`); Demo data, Reset
  reseeds them with new ids, and a Reviews tab left open across a reset gets a 409 "reload the page" answer
  instead of a wrong save. Rejected: `seedId` ids; they would work too, but the task asked for newId.
- D12-58 The seed: all 18 reviews shown and the section on. Order: Unique D., Ricardo E. and Routine Life
  Fitness first, then the other Google reviews in file order, then Drew's and Nelly's theCut reviews in file
  order. Home shows the first three shown reviews in the owner's order instead of a separate "on Home" flag:
  one rule, and the owner changes Home by moving a review up. Wesley T. is left out entirely, Lamont I. is the
  short version, every review has 5 stars, theCut ones have no date, and the text is byte for byte the data
  file's (a test compares them).
- D12-59 Nelly's theCut reviews say "Mike". The data file's team entry says Mike is Nelly's own name
  ("Reviews call him Mike"), so they are right, kept word for word and shown. Open item for Dontrise: confirm
  Nelly is happy with "Mike" on the Nelly Cutz page, or hide those two in Website, Reviews.
- D12-60 One writer for the reviews: `PUT /api/admin/reviews`, owner only, takes
  `{ enabled?, google?, items? }`. `items` lists every stored review once, as id and show only, in the new
  order (the position becomes `sortOrder`, 10 apart). The request is strict: a review with text, stars or a
  name, an extra key such as a new review, a review listed twice or a place id is a 400; a list that does not
  name exactly the stored reviews is a 409. So the dashboard can never type, change or add a quote, and every
  review on the site stays real. The read and the write share one transaction. Rejected: saving the reviews through
  `PUT /api/admin/settings` like the other panels (it would accept any text).
- D12-61 `PUT /api/admin/settings` has `reviews` left out of its schema (`shopSettingsUpdateSchema`): zod
  strips it, so a save that omits the group keeps it (the D12-22 rule) and a save that carries it (every
  panel sends back the settings it loaded) changes nothing. This goes one step past the google rule (optional,
  replaced when present) because a stale tab must neither undo a Reviews save nor change a quote. `google`
  keeps its D12-22 rule.
- D12-62 The Google rating, count and checked date are edited in Website, Reviews and saved through the same
  route with `googleRatingSchema`, a strict part of the Google block: the place id (Directions and the review
  links) cannot change there. The panel has two kinds of save: the section switch and the rating are a form
  with one Save (off until something changed), and in the list each Show, Hide or arrow saves at once with a
  toast, as Services and Gallery do. Rejected: one Save for everything (moving a review would take a second
  click, unlike the other lists). No drag and drop: the arrows are enough for 18 rows and less code.
- D12-63 Audit: one entry per Reviews save, action `settings.reviews.update`, entity `shopSettings/shop`,
  before and after holding the switch, the rating, count and date, and each review's id, name, show and sort
  order (no quote, since it never changes). Same helper as the other panels.
- D12-64 `/api/shop` gains `reviews`: only the shown ones, in order, as
  `{ id, name, text, stars, source, date, staffId }` (`date` null for theCut), and an empty list while the
  section is off, so a hidden review never leaves the server. Home and the chair pages read it from the shop
  answer every page already has, so there is no new request. A settings document written before the field
  reads as `{ enabled: true, items: [] }`; the live showcase gets the reviews from Demo data, Reset, like the
  rest of the new seed.
- D12-65 Display. Home, "What clients say", after the work and before Visit: the rating line (only when a
  rating and a count are set; "Read them on Google" and "Leave a review" need the place id) and the first
  three shown reviews. A chair page: up to three shown reviews about that chair under its menu, with no rating
  line (the rating is the shop's). Either section is left out when no review would show. Stars are `Star01`
  from the icon set, a filled row clipped to the value over an outline row, hidden from screen readers with
  the rating in words beside them (a card says "Rated 5 out of 5"). A card shows the month and year
  ("November 2025"); a theCut card shows the source alone. Cards sit one per row on a phone and up to three
  across from about 830px.
- D12-66 No `aggregateRating` or any review markup in the JSON-LD: Google ignores self-served review markup
  for a local business, and the rating is copied by hand. `shopJsonLd` already left it out; its unit test now
  passes reviews in and checks that none reach the structured data.
- D12-67 Copy sweep (milestone 5): searched `src`, `server` (with the email templates), `shared`, `seed`,
  `scripts`, `tests/helpers` and the living docs for the old stand-in phone, Dontrise's personal number, the
  five made up barbers, em dashes, emoji and written-in numbers. Code and copy were clean of the first four.
  Two numbers were written in: the Visit page said "up to 2 hours before" whatever the setting, and the manage
  page printed the cutoff as `minutes / 60` ("1 hours", "1.5 hours"). Both now read the setting through
  `src/lib/booking/policy.ts` (`cutoffSpan`, `cancelPolicyLabel`, `changePolicyLabel`), which the booking card
  already used. The masking unit test's sample number was the old shop number; it is now another 555 number.
  Left as they are: the reports, `docs/content`, older DECISIONS and PROGRESS entries and the p6 audit capture
  (history), the two tests that assert the old numbers never appear, and the `/kit` samples (real shop data or
  a 555 number).
- D12-68 The copy rules unit test now covers more: em dashes and emoji also across `server`, `scripts`,
  `tests/helpers` and every top-level `docs/*.md`, and a new case fails if the site source, the email templates,
  the seed or either guide names one of the five made up barbers, the old stand-in number or the personal
  number. Rejected: a grep step in CI (one more place to keep in sync; the unit suite already runs everywhere).
- D12-69 The Gallery tab's alt text Save and its "Credit the work to" choice saved without a word; they now show a
  toast ("Credited to Drew. It now shows on Drew's page too.", "Credit removed...", "Alt text saved."), as the
  design rules ask of every save and as the owner guide now describes. No other behaviour changed.
- D12-70 The owner guide PDF converter (`scripts/guide-pdf.ts`) joins wrapped lines: a line that does not
  start a heading, image or list item continues the paragraph or item above it, and a numbered list keeps its
  number (`<ol start>`) after bullets break it. Before, every wrapped line became its own paragraph and the
  steps after a wrapped line restarted at 1. Rejected: a Markdown library (a new dependency for one file).
- D12-71 Owner guide: Team, Prices (step by step), Website gains Reviews (show, hide, order, the section
  switch) and the Google rating fields, Gallery explains crediting a photo to a barber, Settings says the
  placeholder email stays off the site and that the Visit page and confirmation read the cancel time, and a new
  section 13 lists every value still marked PLACEHOLDER in Dontrise's words with where he changes it (chair
  numbers, the cleanup gap, the reply-to address and the website address have no dashboard field, so they go
  to Visualize). Its p11 screenshots stay for now with a note that they show sample barbers; recapturing them
  needs Playwright, which this part does not run. The PDF is re-rendered.
- D12-72 Barber guide: two lines. The walk-in list shows only the barber's own services at their own prices,
  and a gallery photo the owner credits to a barber shows on that barber's page. No names changed.
- D12-73 `/kit` already showed RatingLine (rated, unrated), ReviewCard (dated, undated), PriceOverrideEditor
  (saved entries, refused, no services) and ReviewsEditor (normal, refused, empty and off). ReviewsPanel only
  loads and saves, so it is not rendered whole; its two own states are now one exported `ReviewsPanelState`
  (loading, error) that the panel and the kit both render, so their copy cannot drift. `tests/e2e/kit.spec.ts`
  checks each state and the field error, saving, toast and refused paths of both editors, and finds the kit
  blocks by their class: the reviews editor's own section is a region named "Reviews", so the M4 check by role
  and name would have counted four. Not run in this part (no Playwright until the milestone 5 captures).
- D12-74 Docs: ARCHITECTURE.md gains the `google` and `reviews` settings (links, hand-copied rating, the one
  writer, defaults for old documents, no JSON-LD rating), the per barber pricing rule next to the availability
  rules (each chair quoted on its own minutes, first available as the lowest total, the booking snapshot), the
  booking snapshot note and the seed photo id (`seedId('photo', file)`, no `sourceKey`, D12-42).
  DESIGN-SYSTEM.md gains ReviewsPanel and a photo rules section. DEPLOY.md section 11 says what the seed now
  holds, that the live showcase needs Demo data, Reset after this deploy, that Cloudinary is a real launch
  storage choice, and where to credit photos. SITE-REPORT.md gains the prompt 12 additions and open items.
- D12-75 The prompt 12 screenshots show the real state only, with no FIXTURE set. All 15 manifest photos are
  in `seed/photos/` now (the lead's UPDATE 2), so Home already shows its six marked photos, the gallery all 14
  and the chair strips three, which is the "more photos" layout the fixture set was meant to show. Rejected:
  generated fixture images (they would only repeat what the real photos show, and could be mistaken for them).
  The capture script is `tests/e2e/p12-capture.ts` (demo build on 4176, Demo data, Reset first, reads only).
- D12-76 The Home hero sets its own text color (`.exq-hero { color: var(--fg) }`). With a photo the hero is an
  ink band (`.exq-dark`), but the title lines and the three info values had no color of their own and
  inherited the body's ink in the light theme: "Gifted hands." and "cuts." were black on the scrim at 390 and
  black on ink at 1280, which the first capture showed. Rejected: a color on each child (the next child added
  would miss it again). `tests/e2e/rules.spec.ts` now checks the computed colors over the photo.
- D12-77 `IconButton` takes an optional `tip`, a shorter tooltip for a label that names its item. The Website,
  Gallery rows use "Move up", "Move down" and "Remove" as tooltips while their accessible names keep the
  photo's alt text. The full labels ("Move Full beard and fade, client leaning back in the chair down"),
  centered and unwrapped, ran past the right edge and gave that tab a 25px sideways scroll at 1280.
  Rejected: wrapping the tooltip (a 14rem tooltip still runs off near the edge from 1024 to about 1100).
- D12-78 Axe and the image rules on the photo states run in `tests/e2e/rules.spec.ts` with the shop's real
  photos stubbed into `/api/shop` and `/api/gallery` in the browser (the dev e2e server stores no photos):
  the hero photo behind the text, Home's six, the gallery with a Drew chip, Drew's own strip (two photos
  credited to him) and Lee's "From the shop" strip, light and dark, 390 and 1280. `/chairs/drew` and
  `/chairs/iniya` join the page lists for axe, type sizes, tap targets and alt text. Rejected: uploading
  photos to the dev server (state leaks into later specs when a cleanup step fails) and running the rules
  against the demo build (not part of the dev config the gate runs).
- D12-79 Lighthouse ran once (13.5.0, mobile, simulated throttling) on the demo build, the only local profile
  that serves photos (GridFS, brotli like Vercel): Home 81, Gallery 74, Drew's page 93 for performance,
  accessibility 100 and CLS 0 on all three, SEO 63 because the showcase is noindex
  (`docs/screens/p12/lighthouse.json`). Home's LCP is the hero photo (3.6s: its URL is known only after
  `/api/shop`); Gallery's is 7.6s with 900 KB of images, because the GridFS driver serves the 1200 to 1600px
  files into 180px tiles (Lighthouse estimates 781 KiB of savings). Not fixed in this part: the fix is
  resized copies at seed and upload time, or Cloudinary for the real launch (its `srcset` already asks for
  400px tiles). Rejected: a resize step on the server in a capture pass (a new image pipeline, not a visual
  fix).
- D12-80 The red display line on the hero photo (Rob's call after the milestone 5 captures). Red text on a
  photo or on ink is always `--red-on-dark` (#FF5470), never `--red` (#C8102E): the hero with a photo is
  `.exq-dark` in both themes, so "Exquisite" already rendered #FF5470 there, and that stays the brand rule.
  The word stays red and the scrim keeps its design; only its strength changed. Measured on the real hero
  photo on the demo build with the title text hidden, the brightest pixel under the line box (the milestone 5
  method) gave 3.99:1 at 390 and 3.67:1 at 768 at the old 80% ink (glyph box only: 4.22 and 4.36), short of
  4.5:1. `--scrim-photo` is now 87% ink, the lightest whole step that passes at both widths: 4.75:1 at 390 and
  4.51:1 at 768 (glyph box 4.91 and 5.00), identical in light and dark; 86% gives 4.34:1 at 768. White text
  on it is 13.2:1 or more over any photo. `tests/unit/heroScrim.test.ts` holds the measured pixels and fails
  if the token gets lighter, and `tests/e2e/rules.spec.ts` checks the line's computed color in both themes.
  Rejected: a white accent line (drops the red) and a darker band only behind the title (a second scrim
  token for one line).
- D12-81 A move to another barber reprices the booking (Rob, must fix). The resolver's Move now prices the
  booking for the new chair with the shared helper (`quoteMove` in `shared/lib/servicePricing.ts`: the new
  chair's own entry, else the service's current price and time, else the stored line when a service record is
  gone) and writes the service lines, `durationMinutes`, `totalPriceCents` and the end time from the same
  start, with the slot locks taken over the new length, all in the change's transaction. The cleanup gap is per
  service, so it stays. A chair whose own length does not fit (past its hours, or into another booking) is not
  offered, and asking for it anyway fails the lock insert and rolls the whole change back. `moveOptions` carry
  each chair's `totalPriceCents` and `durationMinutes`, and each affected booking its current ones, so the
  "Move to" list reads "Drew, $40" (plus the minutes when they change) with a line under it ("With Drew: $40,
  45 min (now $50, 75 min)") before the owner applies anything. The owner's Reschedule with another barber
  already repriced (D12-32); its Barber list now shows the same per barber price, and a barber who does not do
  the services is listed but disabled. The customer is emailed the move ("Your appointment has been moved",
  the new barber, the lines and the total at the new price), so D11-08 no longer holds: the link version moves
  up like a reschedule, which keeps the outbox dedupe key unique per move and raises the calendar SEQUENCE so a
  calendar app replaces the event. Rejected: keeping the old price (the spec prices a booking by the barber
  actually assigned) and a silent move (the customer would arrive expecting another barber and price).
- D12-82 One person's price is exact, never "From" (Rob, must fix). `resolveServiceForStaff` and
  `quoteForStaff` return `priceFrom: false`, so a chair page, a barber chosen in booking (the service step, the
  barber step, the bar and the summary card), the owner's New booking panel with a barber, and the barber's
  own walk-in list print the barber's exact price whatever the service's flag says (Drew's page reads $40, $25
  and $65, as his theCut menu does). "From" stays where no one person is meant: `/services`, the Home menu and
  first available, from the service flag or when the people differ. Bookings store `priceFrom: false` on every
  line, and the emails and the booked summaries ignore a stored flag, so a booking made before this change no
  longer prints "from" or the "(starting price...)" note either. Team, Services shows each service at that
  barber's own price. Rejected: keeping the service flag for one person (D12-27; the spec says a chosen
  barber's page shows that barber's prices, and those menus list flat prices).
- D12-83 Lighthouse under 85 (Home 81, Gallery 74, D12-79) stays an open item in this PR (Rob's call): no
  smaller photo copies here. The photos move to Cloudinary before the real launch, which already serves 400px
  tiles; if Cloudinary is delayed, smaller copies for the GridFS and local drivers go in the next prompt.
- D12-84 A settings save no longer writes the Google block. Every settings panel sends back the whole document
  it loaded, so a tab opened before a Website, Reviews save put the old rating and count back (tab A loads
  4.7 from 15, tab B saves 4.8 from 16, tab A saves Shop info: 4.7 again). `shopSettingsUpdateSchema` strips
  `google` like `reviews`, and `PUT /api/admin/reviews` is the one writer of the rating, count and checked
  date; the place id comes from the seed and has no editor. `tests/integration/realShop.test.ts` replays the
  two tabs. Rejected: merging only the place id from the settings route (nothing in the UI edits it).
- D12-85 The sitemap skips a chair that takes no online bookings, so Iniya's page is not listed (the prompt:
  "first available, the booking staff picker and the sitemap skip her cleanly"; this replaces D12-11 and
  part (a) of D12-25). Her page still answers and is linked from The Chairs. Rejected: listing her (the
  literal instruction says skip, and the cost is one filter).
- D12-86 The stand-in shop email now lives in `seed/shop.ts` (`PLACEHOLDER_SHOP_EMAIL`, marked PLACEHOLDER) as
  hard rule 9 asks; the comparison moved from `shared/lib/email.ts` to `server/lib/publicEmail.ts`, because
  only the server hides it (`/api/shop`, the calendar file) and the client must not bundle the seed. A unit
  test checks that the literal sits on a PLACEHOLDER line in the seed and nowhere in the server code.
- D12-87 Review claims not fixed here. (a) The barber walk-in form for a barber hidden from the website:
  rejected, it cannot happen. `authenticateTeam` refuses the session of a barber with `showOnWebsite` off
  (`usableStaff` in `server/auth/teamAuth.ts`), so the portal goes back to sign in and the form never shows
  for them; a trial test got 401 for Nelly's session once she was hidden, and the PIN sign in already answers a
  hidden barber like a wrong PIN (`tests/integration/teamAuth.test.ts`). The public staff list and the
  portal therefore always agree. (b) The owner guide pictures still show the prompt 11 sample barbers: per
  Rob, the final step recaptures them with the guide mode of `tests/e2e/p11-capture.ts` on the demo build and
  reruns `scripts/guide-pdf.ts`; this step ran no Playwright beyond the hero measurement. (c) The prompt 12
  report is written in the final step too, because it must carry the final gate's results and the commits.
- D12-88 tests/integration/manualBookings.test.ts no longer depends on the time of day. Its clock is
  frozen (only Date, timers stay real) at 13:00 shop time on the next Tuesday and runs on from there,
  because walk-ins and the lead time are about "now". Every date-based booking in it uses the barber's
  next working day (from the stored shop and staff hours) at a fixed time no other test in the file uses
  (Lee 12:00, 15:00 and 17:00; Dontrise 10:00 and 11:00). Before this the file failed every evening from
  20:00 shop time, when a booking a few hours out spilled past midnight.
- D13a-01 Today's chairs is a carousel under 1024px with native scroll and CSS scroll snap, no library:
  `scroll-snap-type: x mandatory`, cards at 82% of the width under 768px and 44% from 768px (two in
  view on a tablet, the next peeking in), `overscroll-behavior-x: contain`, `overflow-y: hidden`. From
  1024px the grid is unchanged. Rejected a JavaScript slider: more code, worse scrolling on phones.
- D13a-02 The autoplay timer is a small controller apart from the DOM (`carouselAutoplay.ts`), tested
  with fake timers. Holds (finger down, hover, focus inside, off screen, hidden tab) restart the full
  interval when released; a stop is for good. A `pointercancel` on the strip means the browser took
  the gesture for scrolling, so it counts as the user's swipe, as does a lift with the strip moved.
- D13a-03 The carousel region is named "Today's chairs carousel": the section around it is already a
  region named "Today's chairs" by its heading, and two regions with one name confuse a screen reader.
- D13a-04 Dots are 44px buttons labeled "Show [name]", the current one `aria-current="true"` and
  drawn longer in the accent color. No live region: auto-advance announces nothing.
- D13a-05 `tests/e2e/scroll.spec.ts` checks every public page at 360, 390 and 414 for sideways
  overflow and names the elements past the edge. None were found, so nothing was clipped: no
  `overflow-x: hidden` on body or html.
- D13a-06 Reveals keep their shape but get lighter: 8px of travel, `--d-reveal` 280ms,
  `--stagger-reveal` 40ms, and the observer starts them 15% of the viewport early
  (`rootMargin: 0px 0px 15% 0px`), so a card is already rising when it comes into view. The clip-path
  photo wipes and the hero line rises are unchanged. Rejected removing reveals: they cost nothing on
  a phone at this size.
- D13a-07 Scroll listeners: the carousel's is passive and reads once per frame; the keyboard
  detector's visualViewport resize is passive; the lightbox's onScroll is React's own listener on
  a scroll event, which cannot block scrolling, so it stays. No `scroll-behavior: smooth` on html;
  body and the main area use dvh and svh behind a vh fallback. The only nested scroll areas are the
  carousel, the booking day chips and the lightbox track, all meant to scroll. The carousel works
  without IntersectionObserver (it then runs whenever the tab is visible).
- D13a-08 The Visit map is Google's keyless embed (`/maps?q=<name, address>&output=embed`) in a fixed
  4:3 frame (16:9 from 768px), lazy, titled, `referrerpolicy="no-referrer-when-downgrade"`. On a
  touch screen a "Tap to move the map" layer covers it until tapped, so a finger over the map scrolls
  the page; with a mouse (`hover: hover`) the layer is not shown. Directions sits right under the map
  and works without the frame. `frame-src https://www.google.com https://maps.google.com` is added to
  the CSP and its test.
- D13a-09 The hero scrim is one gradient, `to top`: `--scrim-photo-strong` (90% ink) over the lower
  78% of the hero, where every text line sits, fading to `--scrim-photo-light` (62%) at the top band
  where the faces are. On a phone the text spans the full width, so "lighter on the right" would put
  a bright photo behind the end of every line: a right-to-left gradient measured 3.57:1 for the red
  line at 390. Measured over every text box on the real photo: red 5.08:1 at 390 and 4.90:1 at 768,
  white 10.6:1 and 8.92:1; at 1280 the text is on plain ink (6.07:1 and 18.88:1). The one gradient
  allowed by the copy rules moves from the old placeholder stripe (removed) to this scrim.
- D13a-10 No photo: `PhotoFrame` shows a compact ink panel with the chair number in Jost 900, the
  name and the small Q mark, in cards and on the chair page. On phones the chair page panel is 40svh
  (at most 280px) and the Book action is ordered before the bio and the handle, so the name,
  specialty and Book are in the first screen.
- D13a-11 A chair with `acceptsOnlineBooking: false` and an Instagram handle gets a phone bar of
  CALL plus MESSAGE ON INSTAGRAM (a new-tab link); any such chair, not only Iniya. A chair without
  online booking and without a handle gets no bar.
- D13a-12 site.spec's uncredited lightbox check looks only for barber book links (`/book?barber=`),
  so the shop-wide "Book a chair" link is allowed.
- D13b-01 Archivo comes from `@fontsource-variable/archivo` and its `wdth.css`: that file carries both axes
  (`font-weight: 100 900; font-stretch: 62% 125%`) in one latin woff2 (90 KB), which is the one file
  preloaded. The latin-ext and vietnamese faces in the same CSS load only for text in their ranges.
  Rejected self-hosting under public/fonts: the package already ships the width axis.
- D13b-02 Width tokens `--w-display` 122%, `--w-head` 116%, `--w-label` 114%, used by the display,
  heading and label rules; body stays at 100%. Labels went from 600 to 700 and prices and h3 to 800, so
  the small caps read as a sign rather than soft. Display line height 1 and -1% tracking.
- D13b-03 With the wider label, a pill button can run past a 360 phone (the empty gallery's "See the
  latest on Instagram"). Buttons now keep `max-width: 100%` and let a long label wrap, instead of
  clipping the page.
- D13b-04 Emails use `Archivo, 'Helvetica Neue', Arial, sans-serif` as a stack: mail clients that have
  Archivo show it, the rest fall back. No web font is loaded in mail.
- D13b-05 The brand script re-renders the icons too; they carry no text, so the regenerated PNGs were
  reverted and only og.png (the tagline in Archivo) changed.
- D13b-06 The owner dashboard is dark only. Its surfaces are the `--adm-*` tokens (page #0E0E0E, card
  #171717, raised #1F1F1F, lines #2B2B2B and #3A3A3A, text white, secondary #A8A8A8) scoped on
  `.exq-app[data-state='admin']` by overriding the semantic surface variables, so every kit part,
  sheet, toast and form in the admin goes dark without its own rules. The public site keeps its light
  and dark themes; the Appearance switch left Settings and the theme menu left the shell. Cards are
  16px there (`--r-card` rescoped) and inner tiles get `--r-tile` 12px. The primary button is a red
  fill with white text in the dashboard; outline stays white. The marks are always the white files.
- D13b-07 No side menu. The shell is one top bar (stacked white logo, Shop | Website, search, the
  shop clock to the minute, New booking, the account menu) and one row of section tabs. Shop:
  Today, Bookings, Schedule, Clients, Team. Website: Announcement, Top of page, Hours, Services
  and prices, Gallery, Reviews. The side is remembered in localStorage (`exq-admin-side`, try and
  catch) and `/admin` lands on that side's first tab, Shop Today until the owner switches; on the
  account pages (Settings, Audit, Outbox) the tabs of the remembered side stay shown. Under 1024px
  the switch moves from the top bar into the tabs row, which scrolls sideways. The account menu is
  a button with the owner's initial and a small menu (Settings, Audit log, Outbox, Change password,
  Sign out); a native `details` was tried first and dropped because `summary` has no button role.
  A `data-slot="check-in"` span in the top bar is the place for prompt 13c's Check in button.
- D13b-08 New addresses: `/admin/shop/{today,bookings,bookings/:id,schedule,clients,clients/:phone,
team,team/:id}` and `/admin/website/:tab`. Every old address redirects with its path remainder and
  query kept (`/admin/bookings?range=past` to `/admin/shop/bookings?range=past`, `/admin/customers`
  to clients, `/admin/website?tab=photo` to `/admin/website/top`, `/admin/photos` to the gallery),
  so bookmarks, the guide's links and the printed cards keep working. The Website page reads its
  section from the path and no longer carries its own tab strip; its heading is the section name
  under a "Website" kicker.
- D13b-09 The `Sidebar` kit component was deleted with its CSS (nothing used it after the shell
  change); `BottomTabs` stays for the barber portal. The owner guide still describes the old menu;
  it is rewritten with prompt 13d's barber portal and editor work.
- D13b-10 The floor rules are pure functions in `shared/lib/floor.ts` (`chairState`, `currentBooking`,
  `chairWindow`, `progressOf`), fed by `server/services/floor.ts` and tested with a frozen clock in
  `tests/unit/floor.test.ts`. In chair: the confirmed booking Start was pressed on (latest first),
  else the one whose booked window holds now; its bar runs from the real start (or the booked start)
  for the booked duration, so a late start ends late. Free: no current booking and the chair has
  hours; Off today: no hours and nothing booked; Instagram: a chair that does not book online and
  has a handle, unless something is booked in the system for it today. Coming up: today's confirmed
  bookings not started and not in a chair; waiting: those marked Arrived.
- D13b-11 `arrivedAt` and `startedAt` are optional nullable UTC dates on the booking document, exposed
  on the admin view, stamped by `POST /api/admin/bookings/:id/arrived` and `/start` (owner only).
  The repo update matches `status: confirmed` and the field still empty, so a second tap or a race
  writes nothing and the service answers with the stored booking; one audit entry
  (`booking.arrived`, `booking.start`) per real stamp; 409 INVALID_TRANSITION for completed, no-show
  and cancelled bookings. Done and No show use the existing status route (with Undo in the toast,
  back to confirmed); Move opens the booking sheet, whose move already reprices. The barber portal
  is left alone for 13d.
- D13b-12 Today keeps the alerts strip, the quick actions, the week chart and the latest events
  from the old Overview under the floor (existing behavior, the mockup's look); the four old stat
  tiles became Today so far (booked, done, walk-ins by source, takings as the sum of completed
  stored totals). The floor refreshes every 30 seconds while the tab is visible, when it comes back,
  and after every action, keeping the last data on screen (`useFloor`); progress is computed from
  the server's `now` in the response and the bar is a plain width with no transition. No websockets.
- D13b-13 `availabilityRoutes.test.ts` built its "inverted range" from `nextDate(3, 7)` and
  `nextDate(3, 3)`, which land on the same Wednesday when the suite runs on a Monday (both roll
  forward to it), so the range was not inverted and the test failed on Mondays. The second date is
  now the day before the first, whatever the weekday. Not a product change.
- D13c-01 Archivo is self-hosted from `public/fonts`: the fontsource latin file with the width axis
  instanced to 100 to 125% by `fonttools varLib.instancer` (the site uses nothing narrower), full
  weight axis kept, 62 KB against 91 KB. `src/styles/fonts.css` declares the face, `index.html`
  carries one static preload, `vercel.json` caches `/fonts/*` a year, the brand and guide scripts
  read the same file, and the package is gone. Characters outside latin fall back to the system
  font (the old latin-ext and vietnamese files only ever loaded for those characters).
- D13c-02 The week chart and the latest events moved from Today to the bottom of Bookings; Today
  still fetches the overview for the alerts strip only. Plainer than a new alerts endpoint.
- D13c-03 Rob's standing rule is in CLAUDE.md under Conventions: booking flows never open in a
  side drawer or sheet; they all open the full-screen `NewBookingFlow`. Side sheets read details.
- D13c-04 The walk-in line is the `walkIns` collection (zod in `shared/schemas/walkIn.ts`, index
  `(status, position)` plus `createdAt`). The phone is stored in E.164 like every other number
  (so client lookups match) and shown as (XXX) XXX-XXXX in every view; the prompt's display form is
  the view, the storage form stays consistent. Positions are integers; move swaps with the
  neighbor in one transaction. Audit actions `line.add`, `line.update`, `line.move`, `line.left`,
  `line.seat` on entity type `walkIn`.
- D13c-05 Wait estimates are pure in `shared/lib/waitEstimate.ts`: a chair's free time is the end of
  its current cut (real start when Start was pressed) or now; each person ahead takes the first gap
  that fits their minutes before the chair's next booking; first available goes to whichever chair
  frees first. "Free" within one minute, otherwise "about <time> (n min)", and "unknown" when the
  chair has no hours today and no cut going (then nothing is shown as a number). Minutes come from
  the chair's own service times when a chair is chosen, else the shop's. The per-chair state
  ("Free about 2:50") counts only that chair's own line, not the shared pool.
- D13c-06 Seating goes through `createManualBooking` (source walk-in, `arrived: true` so arrivedAt
  is set at insert) and so through the slot locks in the booking transaction. The entry is claimed
  first with a conditional update (waiting to seated), so two taps make one booking; a seat that
  loses the slot race is handed back to the line and answered with CHAIR_BUSY and the estimate.
  Seating ignores the hours (the barber is standing there, like any walk-in); the chair's current
  cut and its bookings still decide. Barbers seat into their own chair only (chair scope).
- D13c-07 The line rides in the floor response (`line`, and `seatWalkIn` on a free chair for the
  first person it can take) so Today keeps one 30 second poll; `GET /api/admin/line` and
  `GET /api/team/line` serve the panel's actions and the portal.
- D13c-08 NOW is decided on the server in `bookNow`: a free chair with nobody ahead in its line gets
  a walk-in booking starting this minute (off the 15 minute grid, no lead time, source walk-in,
  arrivedAt set); any other case joins the line with the estimate. A slot race lost mid-way also
  joins the line. Only owner and barber sessions reach it (`/api/admin/now`, `/api/team/now`);
  the public `/api/bookings` keeps the grid and the lead time and `/api/now` does not exist.
- D13c-09 Seat from the line stays a one-tap action on Today (the person is already in the line
  with their services and chair); the flow is for new bookings. A free chair's "Seat walk-in #n"
  is the same action with the chair chosen.
- D13c-10 Move and Reschedule open the flow on the Barber or Time step and post to the existing
  `/api/admin/bookings/:id/reschedule`, so repricing, the slot lock swap and the customer email
  are unchanged. The flow shows the new barber's exact price before Confirm.
- D13c-11 A barber books a later time on their own chair through `POST /api/team/bookings`
  (source phone, no override), and the Barber step is skipped for a team session.
- D13c-12 "Discard this booking?" is a nested modal inside the full dialog. The kit's `Dialog`
  ignores close and cancel events that bubble from a nested dialog (`event.target` check), which
  is what let Keep going close only the modal.
- D13c-13 The check-in screen is one component (`src/checkin/CheckInPage.tsx`) at two addresses:
  `/admin/checkin` for an owner session and `/team/checkin` for a barber's PIN session. The two
  sessions live in different cookies and different apps, so one route could not serve both; the
  screen itself is identical. Neither address renders the shell or the portal tabs.
- D13c-14 The appointment lookup is masked at the API, not in the client: `/api/admin/checkin/lookup`
  and `/api/team/checkin/lookup` answer first name plus last initial, the time, the barber and the
  chair number, never a phone or an email, and only today's confirmed bookings (a barber session
  sees its own chair only). Four or more digits match the end of the phone; letters match the
  start of any name word. The tap goes through the same audited `stampBookingMoment` the dashboard
  uses, with the chair scope for barbers.
- D13c-15 "Keep the check-in tablet signed in" is an owner setting (`keepTabletSignedIn`, off by
  default). On, every dashboard sign-in idles out after 30 days instead of 14 (the 60 day cap
  stays). Trade-off: it widens the window for a lost or stolen tablet, and it applies to every
  owner session, not one device, because the session has no notion of a device yet. Barber PIN
  sessions keep their 12 hours. A per-device flag can be added on the session document later.
- D13c-16 The walk-in end screen is the booking flow's own result text ("Head to chair 4 for
  Nelly Cutz", "You're #2 for Drew, about 25 min"); the tablet closes the flow and shows it for
  six seconds, then returns to the start. The flow's close event after a finished walk-in is
  ignored so it cannot replace the end screen. The Wake Lock is requested where the browser has
  it and silently skipped elsewhere.
