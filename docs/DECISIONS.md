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
