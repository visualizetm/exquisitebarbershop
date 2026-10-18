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

| Route         | Sections                                                                                                                     | Status                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| /             | hero text and info row, hero photo (only if uploaded), today's chairs, the menu (ink), the work, visit, ink CTA band, footer | prompt 10                                   |
| /services     | ink page: label, heading, group chips with counts, price rows with Book links                                                | prompt 10                                   |
| /chairs       | "Pick your chair": chair cards with CHAIR number, name, specialty, next open                                                 | prompt 10                                   |
| /chairs/:slug | portrait, name, specialty, next 3 openings, services with prices, work strip, Instagram, BOOK [NAME] in the phone bar        | prompt 10                                   |
| /gallery      | heading, barber filter chips, 2 and 3 column grid, swipeable lightbox                                                        | prompt 10                                   |
| /visit        | hours with today marked, address, directions, call, policies, parking                                                        | prompt 10                                   |
| /book         | four part step bar, numbered steps, option cards, day strip, times by part of day, details, confirm, ticket                  | prompt 10                                   |
| /manage       | ticket, reschedule, cancel sheet                                                                                             | prompt 10                                   |
| /admin/\*     | sign in, today, schedule, bookings, new booking, block time, who's in, customers, settings, photos, audit, outbox, account   | prompt 3; new tokens and scale in prompt 10 |
| /kit          | every kit component in every state                                                                                           | development builds only                     |
| /sitemap.xml  | public routes plus one entry per listed chair, from the API                                                                  | milestone 5                                 |
| /setup        | setup secret field, Run doctor, Run setup, checklist; exists only while BOOTSTRAP_SECRET is set; noindex                     | prompt 5                                    |

## Component inventory

See `docs/DESIGN-SYSTEM.md` for the kit table (name, props, states, where used).
Site pieces built from the kit: `src/components/site/TodaysChairs.tsx`
(staff, linkTo, layout), `ServiceRows.tsx` (services, limit, showDescription),
`PhotoGrid.tsx` (photos, columns, firstPriority), `HoursTable.tsx` (hours).
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
per page load in the public layout and shared through `ShopContext`. Staff
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

None. Directions use a Google Maps search URL as a plain link. Instagram is a link.

## Known bugs and TODOs

- The Visit policies and parking lines are placeholders until confirmed.
- The OG image URL and the robots Sitemap line come from APP_BASE_URL at build
  time; set it in Vercel before the first production build.
- The owner's own password can only be reset from a shell (`npm run user:reset`)
  when nobody can sign in; see docs/OPERATIONS.md.
- Responsive photo sizes exist only on Cloudinary (four widths per frame); photos on the local, R2 or
  GridFS drivers are one size up to 2000px.
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

## Last commit

Prompt 11, 2026-10-18: the owner dashboard, the barber PIN portal, the demo notice, icons and social links. Before it, prompt 10, 2026-10-18: the Shop Sign redesign (tokens, kit and /kit, frame, pages, booking, admin), the
motion system, the phone bottom bar and Cloudinary photos. Before it, prompt 9, 2026-10-18: the function runs under plain Node on Vercel (bundle, `api/index.js`, rewrite),
with `npm run test:vercel-function` in CI. Before it, prompt 8, 2026-10-18: the showcase demo (auto setup, demo sign-in, GridFS photos, noindex,
down-screen details), the hero and sign-in logo fixes, the showcase production-like run and
`docs/screens/p8/`. Before it, prompt 7, 2026-10-17: the launch without R2, visible configuration failures,
the nav logo, the API-down copy, route-change focus, the production-like e2e
run and `docs/screens/p7/`.
