# Site report

A living inventory of the Exquisite Barber & Beauty Lounge site. Updated at every
milestone. Values that are secrets are named, never written.

Last commit: see the bottom of this file.

## Stack and hosting

- Vite 7, React 19, TypeScript strict, React Router 7 (BrowserRouter, real paths).
- One Vercel serverless function (`api/[...path].ts`) over `server/`, MongoDB
  (Atlas, replica set, transactions), zod schemas shared from `shared/`.
- Luxon for time in America/New_York. Jost self-hosted from `@fontsource/jost`.
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
- Production-like run: `npm run test:e2e:prod` builds the bundle and serves it
  over https with the vercel.json headers, the API in production mode with the
  launch variable set (no R2), and a twin without MONGODB_URI
  (`scripts/prodlike-server.ts`, `tests/e2e/prod/`); `npm run test:e2e` runs
  the dev suite and then this one.
- SEO: per-route meta from `usePageMeta`, JSON-LD BarberShop from `/api/shop`,
  `/sitemap.xml` from the API, `public/robots.txt`, `public/og.png` (1200x630),
  favicons, apple touch icon and `site.webmanifest`. Brand assets are rendered
  by `scripts/brand-assets.ts`.

## Routes and sections

| Route         | Sections                                                                                                                   | Status                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| /             | hero, today's chairs, services preview, the work, visit, ink band, footer                                                  | milestones 3 and 5                          |
| /services     | heading, group chips, service rows with Book links                                                                         | milestone 3                                 |
| /chairs       | heading, chair card grid                                                                                                   | milestone 3                                 |
| /chairs/:slug | photo arch, badge, name, role, specialty, next openings, services, work strip, IG, sticky Book                             | milestone 3                                 |
| /gallery      | heading, barber filter chips, photo grid, lightbox                                                                         | milestone 3                                 |
| /visit        | heading, hours table, address, directions, call, policies, parking                                                         | milestone 3                                 |
| /book         | step bar, services, chair, day, time, details, confirm, ticket                                                             | logic from prompt 2; restyle in milestone 4 |
| /manage       | ticket, reschedule, cancel sheet                                                                                           | milestone 4                                 |
| /admin/\*     | sign in, today, schedule, bookings, new booking, block time, who's in, customers, settings, photos, audit, outbox, account | prompt 3; restyle in milestone 4            |
| /kit          | every kit component in every state                                                                                         | development builds only                     |
| /sitemap.xml  | public routes plus one entry per listed chair, from the API                                                                | milestone 5                                 |
| /setup        | setup secret field, Run doctor, Run setup, checklist; exists only while BOOTSTRAP_SECRET is set; noindex                   | prompt 5                                    |

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

`src/styles/tokens.css`. Semantic surfaces and type rules in `src/styles/base.css`.

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
OUTBOX_AFTER_RESPONSE, MONGOMS_SYSTEM_BINARY, STORAGE_DRIVER (local, r2 or none),
STORAGE_DISABLED_ACK, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
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
- Photos are stored at one size (up to 2000px) and shown at 290 to 780 device
  pixels; responsive variants would cut gallery weight by about two thirds
  (audit finding, not done: two uploads per photo and an additive `thumbKey`).
- Photos and daily backups are off until Cloudflare R2 is set up
  (STORAGE_DRIVER=none at launch; DEPLOY.md section 10 switches them on).
- The MongoDB Atlas free tier keeps no snapshots, so until R2 is on there is no
  backup of the bookings at all.
- Handoff docs: `docs/OWNER-GUIDE.md` (and `.pdf`), `docs/BARBER-GUIDE.md`,
  screenshots in `docs/guide/` from `tests/e2e/guide.ts`; audit tooling in
  `tests/e2e/audit.ts` and `docs/screens/audit/`.

## Last commit

Prompt 7, 2026-10-17: the launch without R2, visible configuration failures,
the nav logo, the API-down copy, route-change focus, the production-like e2e
run and `docs/screens/p7/`.
