# Site report

A living inventory of the Exquisite Barber & Beauty Lounge site. Updated at every
milestone. Values that are secrets are named, never written.

Last commit: see the bottom of this file.

## Stack and hosting

- Vite 7, React 19, TypeScript strict, React Router 7 (BrowserRouter, real paths).
- One Vercel serverless function (`api/index.js`, which loads the committed bundle
  `server/bundle/app.mjs` built from `server/`), MongoDB
  (Atlas, replica set, transactions), zod schemas shared from `shared/`.
- Luxon for time in America/New_York. Jost Variable self-hosted from `@fontsource-variable/jost`
  (weights 400 to 900, one latin file preloaded).
- Hosting: Vercel (Vite preset). `vercel.json` rewrites every non-API path to
  `index.html`, sets CSP and the security headers, and runs the outbox cron.
- Tests: Vitest with mongodb-memory-server, Playwright for end to end.
- Operations: a daily cron at `/api/internal/cron/daily` (email backstop, photo
  cleanup, backup to R2 with 30 days kept; with STORAGE_DRIVER=none only the
  email step runs), `npm run doctor`, `npm run smoke`, `npm run restore`;
  `/setup` for the first run (loads even while the API refuses to serve);
  MAINTENANCE_MODE and an API-down state in the public layout (`SiteDown`);
  `/api/health` lists the missing variable names while the deployment is
  incomplete.
- Showcase: `DEMO_MODE=true` with `STORAGE_DRIVER=mongo` is a complete site on six variables
  (DEPLOY.md section 11). The first request sets the shop up with sample data; the admin login
  has "Enter demo dashboard"; photos live in GridFS and are served at `/api/media/:id`; every page
  is noindex; Settings, Demo data resets it; `/setup` can clear it for a real launch.
- Production-like run: `npm run test:e2e:prod` builds the bundle and serves it
  over https with the vercel.json headers, the API in production mode with the
  launch variable set (no R2), and a twin without MONGODB_URI
  (`scripts/prodlike-server.ts`, `tests/e2e/prod/`); the showcase has its own
  (`npm run test:e2e:demo`, `tests/e2e/demo/`, an empty database and only the demo
  variables); `npm run test:e2e` runs the dev suite and then both.
- SEO: per-route meta from `usePageMeta`, JSON-LD BarberShop from `/api/shop`,
  `/sitemap.xml` from the API, `public/robots.txt`, `public/og.png` (1200x630),
  favicons, apple touch icon and `site.webmanifest`. Brand assets are rendered
  by `scripts/brand-assets.ts`.

## Routes and sections

| Route         | Sections                                                                                                                                                                                                                               | Status                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| /             | hero (the real photo behind a scrim on phones, its own column from 1024px), today's chairs, the menu (ink, "From" prices), the work (six Home photos), "What clients say" (rating line and three reviews), visit, ink CTA band, footer | prompt 10; real content prompt 12                           |
| /services     | ink page: label, heading, group chips with counts, price rows ("From $x" where barbers differ) with Book links                                                                                                                         | prompt 10; prices prompt 12                                 |
| /chairs       | "Pick your chair": chair cards with CHAIR number, name, specialty, next open; Iniya's says "Book through Instagram"                                                                                                                    | prompt 10; real team prompt 12                              |
| /chairs/:slug | portrait (placeholder for now), name, title, specialty, bio, next 3 openings, that barber's own exact prices and minutes, up to three reviews about them, their work (or "From the shop"), Instagram, BOOK [NAME] in the phone bar     | prompt 10; prompt 12                                        |
| /gallery      | heading, barber filter chips (only once a photo is credited), 2 and 3 column grid, swipeable lightbox                                                                                                                                  | prompt 10; real photos prompt 12                            |
| /visit        | hours with today marked, address with Suite F, Directions (Google Maps place link), Call (610) 609-0786, policies, good to know, parking                                                                                               | prompt 10; real facts prompt 12                             |
| /book         | four part step bar, numbered steps, option cards, day strip, times by part of day, details, confirm, ticket                                                                                                                            | prompt 10                                                   |
| /manage       | ticket, reschedule, cancel sheet                                                                                                                                                                                                       | prompt 10                                                   |
| /admin/\*     | Overview, Bookings, Schedule, Customers, Team (with Prices), Website (with Reviews), Settings, search, quick actions                                                                                                                   | prompt 3; prompt 11 dashboard; prompt 12 Prices and Reviews |
| /kit          | every kit component in every state                                                                                                                                                                                                     | development builds only                                     |
| /sitemap.xml  | public routes plus one entry per bookable chair, from the API                                                                                                                                                                          | milestone 5                                                 |
| /setup        | setup secret field, Run doctor, Run setup, checklist; exists only while BOOTSTRAP_SECRET is set; noindex                                                                                                                               | prompt 5                                                    |

## Component inventory

See `docs/DESIGN-SYSTEM.md` for the kit table (name, props, states, where used).
Site pieces built from the kit: `src/components/site/TodaysChairs.tsx`
(staff, linkTo, layout), `ServiceRows.tsx` (services, limit, showDescription),
`PhotoGrid.tsx` (photos, columns, firstPriority), `HoursTable.tsx` (hours), and
from prompt 12 `Stars.tsx`, `RatingLine.tsx`, `ReviewCard.tsx` (ReviewCard,
ReviewList); dashboard pieces `src/admin/team/PriceOverrideEditor.tsx` (Team,
Prices) and `src/admin/website/ReviewsEditor.tsx` with `ReviewsPanel.tsx`
(Website, Reviews).
Booking and admin pieces: `src/components/booking/*` (ServicePicker, StaffPicker,
DayPicker, TimePicker, CustomerForm, IcsDownload, StepHeading, BookingSummary),
`src/admin/components/*` (AdminNav with the tab bar and side nav, PhotoManager,
BlockTimeForm, ConflictResolver, TimeBlockItem, WeekHoursEditor, BookingList,
ErrorNote) and `src/admin/lib/resizeImage.ts`.
Older components still in use:

- `src/components/Status.tsx`: loading, error and empty line.
- `src/components/booking/*`: ServicePicker, StaffPicker, DayPicker, TimePicker,
  CustomerForm, BookingSummary, IcsDownload, StepHeading.
- `src/admin/components/*`: AdminNav, BookingList, ConflictResolver, BlockTimeForm,
  TimeBlockItem, WeekHoursEditor, ErrorNote.

## Tokens

`src/styles/tokens.css` (the one variables file: palette, six type sizes, motion tokens, dark values).
Global type and layout in `base.css`, components in `kit.css`, the frame in `frame.css`, everything that
moves in `motion.css`, pages in `pages.css` and `booking.css`. Brief: `docs/brand/DESIGN-DIRECTION-V2.md`;
reference: `docs/DESIGN-SYSTEM.md`.

## Prompt 10 additions

- Frame: announcement strip (shop settings `announcement`: enabled, text, link label, link address;
  editor in prompt 11), sticky header, full-screen ink phone menu, the phone bottom bar (CALL and BOOK NOW,
  BOOK [NAME] on a profile, BACK and CONTINUE then CONFIRM BOOKING in booking), a footer with no build stamp
  and no staff link. `/admin` is reachable by address only.
- Motion: CSS, IntersectionObserver and view transitions; no library. Rules and the list of animations in
  DESIGN-SYSTEM.md; held by `tests/unit/motionCss.test.ts` and `tests/e2e/motion.spec.ts`.
- Photos: `STORAGE_DRIVER=cloudinary` (DEPLOY.md section 10b): signed browser uploads, verification,
  destroy on delete, the 24 hour orphan sweep, four widths cropped per frame, `npm run photos:migrate`.
  New variables: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER.
- Checks: Lighthouse mobile on the production-like build (compressed like Vercel): Home 95, Services 96,
  Book 97 performance; accessibility 100; CLS 0 (SEO 69 on the showcase build, which is noindex on purpose).
  Axe (WCAG 2 A and AA) finds nothing on any public page or booking step in light or dark at 390 and 1280
  (`tests/e2e/rules.spec.ts`). Screenshots: `docs/screens/p10/`; recordings:
  `docs/screens/p10/motion/`.

## Data sources and APIs

Public: `GET /api/shop`, `/api/services`, `/api/staff`, `/api/staff/:slug`,
`/api/availability`, `/api/availability/days` (with per day counts),
`/api/availability/next`, `/api/staff/:slug/openings`, `/api/gallery`,
`POST /api/bookings`, `/api/bookings/manage` (GET, cancel, reschedule),
`/api/sitemap.xml` (rewritten from `/sitemap.xml`). `/api/shop` is fetched once
per page load in the public layout and shared through `ShopContext`; from
prompt 12 it also carries `google` (place id, rating, count, checked date) and
the shown `reviews`, `/api/staff` carries each person's `servicePrices`, and
`/api/gallery?home=true` lists the photos picked for Home first. The owner saves
reviews and the rating through `PUT /api/admin/reviews` and a barber's prices
through `PATCH /api/admin/staff/:id`. Staff
and owner routes, including photos, are listed in `docs/ARCHITECTURE.md`
section 5. Photos are stored on Cloudflare R2 (local disk in development) and
read through public URLs.

Env var names (values never written here): MONGODB_URI, MONGODB_DB_NAME,
APP_BASE_URL, MANAGE_LINK_SECRET, CRON_SECRET, EMAIL_PROVIDER, RESEND_API_KEY,
EMAIL_FROM, SEED_OWNER_PASSWORD, SEED_OWNER_EMAIL, LOG_LEVEL,
OUTBOX_AFTER_RESPONSE, MONGOMS_SYSTEM_BINARY, STORAGE_DRIVER (local, r2, none or mongo),
STORAGE_DISABLED_ACK, DEMO_MODE, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
R2_BUCKET, R2_PUBLIC_BASE_URL, R2_KEY_PREFIX, BOOTSTRAP_SECRET, EMAIL_DISABLED_ACK,
MAINTENANCE_MODE.

## Forms

| Form                      | Submits to                                       |
| ------------------------- | ------------------------------------------------ |
| Book, details and confirm | POST /api/bookings (Idempotency-Key)             |
| Manage, cancel            | POST /api/bookings/manage/cancel                 |
| Manage, reschedule        | POST /api/bookings/manage/reschedule             |
| Staff sign in             | POST /api/auth/login                             |
| Password change           | POST /api/me/password                            |
| Admin screens             | the matching /api/admin route (see ARCHITECTURE) |

## Embeds

None. Directions use the shop's own Google Maps page, built from the place id in the settings, as a plain link (with no place id it searches the address). "Read them on Google" uses the same link and "Leave a review" Google's write-a-review link. Instagram is a link.

## Known bugs and TODOs

- The Visit policies and parking lines are placeholders until confirmed, except "Kids welcome" and
  "Wheelchair accessible parking lot" (from the Google profile); the cancel line reads the setting.
- Every value still marked PLACEHOLDER in `seed/shop.ts` (chair numbers, Lee's menu and bio, three people's
  hours, the booking rules, the emails and the website address) waits for Dontrise; the owner guide, section 13,
  lists them in his words.
- The owner guide's screenshots (`docs/screens/p11/guide/`) were taken before the real team was loaded, so they
  show sample barbers and clients; the text is current.
- No storefront photo exists, so Visit has no photo slot.
- The Google rating and count are copied by hand (Website, Reviews); nothing updates them.
- The OG image URL and the robots Sitemap line come from APP_BASE_URL at build
  time; set it in Vercel before the first production build.
- The owner's own password can only be reset from a shell (`npm run user:reset`)
  when nobody can sign in; see docs/OPERATIONS.md.
- Responsive photo sizes exist only on Cloudinary (four widths per frame); photos on the local, R2 or
  GridFS drivers are one size up to 2000px.
- Lighthouse mobile misses the 85 target on the showcase build with the GridFS photos: Home 81, Gallery 74
  (Gallery's tiles get the full 1600px files, about 781 KiB too much; D12-79). Rob's call: no smaller copies
  in prompt 12. The photos move to Cloudinary before the real launch, which already serves 400px tiles; if
  Cloudinary is delayed, smaller copies for the GridFS and local drivers go in the next prompt.
- Cloudinary keeps no data backup: with it on, turn on MongoDB Atlas snapshots (the daily job writes no
  export for this driver).
- The phone bar hides while a text field has focus, so the last field of a form is finished with the
  keyboard's own Go key or by closing the keyboard. Needs a real iPhone check.
- A showcase deployment has no backup and keeps photos in the database; its sample data is
  disposable. Real launch: DEPLOY.md section 11 ("Leaving the showcase").
- The security headers are static, so the HTML shell cannot carry `X-Robots-Tag` in demo
  mode; the build adds the meta tag and a closed robots.txt instead.
- Photos and daily backups are off until photo storage is set up (STORAGE_DRIVER=none at launch;
  DEPLOY.md section 10b switches photos on with Cloudinary, section 10 with R2).
- The MongoDB Atlas free tier keeps no snapshots, so until R2 is on there is no
  backup of the bookings at all.
- Handoff docs: `docs/OWNER-GUIDE.md` (and `.pdf`), `docs/BARBER-GUIDE.md`,
  screenshots in `docs/guide/` from `tests/e2e/guide.ts`; audit tooling in
  `tests/e2e/audit.ts` and `docs/screens/audit/`.

## Known history

- Through prompt 8 the API never ran in production. Vercel runs the compiled function with
  plain Node ESM; `api/[...path].ts` imported `../server/http/app` without an extension, so every
  `/api/*` request answered Vercel's own 500 FUNCTION_INVOCATION_FAILED (ERR_MODULE_NOT_FOUND)
  before any of our code ran. Every earlier explanation of the down screen (missing R2 variables,
  STORAGE_DRIVER, an empty database) was a guess about code that had never executed there.
  Fixed in prompt 9 (bundle, `api/index.js`, JSON error answers); CI had been green because
  Vitest, Playwright and the production-like run all load the server through tsx or Vite.
- Vercel routed `api/[...path]` as a single path segment, which would have 404'd every nested
  API path; fixed with the `/api/(.*)` rewrite (prompt 9).
- Proof it stays fixed: `npm run test:vercel-function`, a required CI step (DEPLOY.md section 12).

## Prompt 11 additions

- Owner dashboard at `/admin`: Overview, Bookings, Schedule, Customers, Team, Website, Settings, with global
  search (`/`), quick actions, alerts and the decision resolver (Keep, Move, Cancel, Cancel and notify).
- Barber PIN portal at `/team` (one shared link, name then 6 digit PIN, 12 hour session), one time setup links
  at `/team/setup/:token`; barbers can no longer sign in at `/admin`.
- Demo notice on demo builds, icons, footer social links (shown only when set in Settings), outage fallback for
  public pages, 170 by 40 phone logo.
- Docs: `OWNER-GUIDE.md`, `BARBER-GUIDE.md` with screens in `docs/screens/p11/guide/`.

## Prompt 12 additions

- Real shop content from `docs/content/exquisite-site-data.json` (Google profile, Squire, theCut, Instagram,
  2026-10-25): address with Suite F, phone (610) 609-0786, hours (closed Monday, 10:00 to 19:00 Tuesday to
  Sunday), the announcement "Walk-ins welcome", the five real people (Iniya shown, booked through Instagram,
  never bookable online), 15 real services. The placeholder email never reaches a public page.
- Per barber prices and times (`staff.servicePrices`, `shared/lib/servicePricing.ts`): "From" prices on the
  shop-wide menu and for first available only; each chair's own exact prices on its page (never "From"), and
  bookings, emails and admin views at the assigned chair's exact price, also after the owner moves a booking
  to another barber (reschedule with a chair, or the resolver's Move, which shows each chair's price before
  the owner confirms and emails the customer the new barber and price); Team, Prices to edit them.
- The 15 real photos (`seed/photos`, loaded by `server/services/seedPhotos.ts` on demo setup and Reset, or
  `npm run photos:seed`): the hero, Home's six, the gallery, chair pages with "From the shop".
- 18 real reviews (`settings.reviews`), word for word: Home "What clients say" with the Google rating line, up to
  three on a chair page, Website, Reviews to show, hide and order them and to update the rating. No review markup
  in the JSON-LD.
- JSON-LD BarberShop with the phone, Suite F, the opening hours and the Instagram page.
- Docs: `OWNER-GUIDE.md` and its PDF (prices, gallery credits, reviews, the Google rating, what to check before
  launch), `BARBER-GUIDE.md`, `DESIGN-SYSTEM.md` (reviews, prices, photo rules), `ARCHITECTURE.md`,
  `DEPLOY.md` section 11. The live showcase shows all of it only after Settings, Demo data, Reset.

## Prompt 13a additions

- Today's chairs is a snapping carousel under 1024px with dots and a cautious auto-advance; reveals
  are lighter (8px, 280ms); a scroll spec proves no sideways overflow on any public page; Visit has a
  lazy Google map (CSP `frame-src`); the hero scrim is a measured gradient; a chair without a portrait
  shows a compact numbered panel; a chair that books on Instagram gets MESSAGE ON INSTAGRAM in the
  phone bar.

## Prompt 13e additions

- The barber portal fits every phone: `minmax(0, 1fr)` columns, tighter tracking on the two big
  buttons, one column below 375, `min-width: 0` on every head, row and page child, the full dialog
  gutter kept on Out for the day; `tests/e2e/fit.spec.ts` measures every portal screen and six
  public pages at 360 and 390 (no sideways scroll, no text past the edge, no clipped box).
- The head script starts the `/api/shop` request on public paths; Book and Manage are their own
  chunks; the editor's saved message is "Saved. Live on the site now" (the public settings are never
  cached). Lighthouse mobile Home on the demo build: 84, LCP 3.7 s, CLS 0 (D13e-05).
- The $10 launch offer: `shopSettings.launchOffer`, `bookings.discounts`, the decision inside the
  booking transaction, the unique partial index `launchOfferOncePerPhone`, the red tag on Home and
  Book, the confirmation and email lines, "$10 off online" for the owner and the barbers, the
  editor's Launch offer section with its usage count. `GET /api/shop` carries `launchOffer` while it
  is live; `GET /api/admin/settings` carries `launchOfferUsage`.

## Last commit

Prompt 12, 2026-10-25: the shop's real content (facts, team, services and per barber prices, photos, reviews)
and the docs and copy pass. Before it, prompt 11, 2026-10-18: the owner dashboard, the barber PIN portal, the demo notice, icons and social links. Before it, prompt 10, 2026-10-18: the Shop Sign redesign (tokens, kit and /kit, frame, pages, booking, admin), the
motion system, the phone bottom bar and Cloudinary photos. Before it, prompt 9, 2026-10-18: the function runs under plain Node on Vercel (bundle, `api/index.js`, rewrite),
with `npm run test:vercel-function` in CI. Before it, prompt 8, 2026-10-18: the showcase demo (auto setup, demo sign-in, GridFS photos, noindex,
down-screen details), the hero and sign-in logo fixes, the showcase production-like run and
`docs/screens/p8/`. Before it, prompt 7, 2026-10-17: the launch without R2, visible configuration failures,
the nav logo, the API-down copy, route-change focus, the production-like e2e
run and `docs/screens/p7/`.
