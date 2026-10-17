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
OUTBOX_AFTER_RESPONSE, MONGOMS_SYSTEM_BINARY, STORAGE_DRIVER, R2_ACCOUNT_ID,
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL.

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

- Brand marks in `public/brand/` are placeholders until the real SVGs arrive
  (same file names).
- The Visit policies and parking lines are placeholders until confirmed.
- `robots.txt` has no Sitemap line until the domain is known (D4-33).
- The OG image URL in index.html comes from APP_BASE_URL at build time; set it
  in Vercel before the first production build.

## Last commit

Milestone 5, 2026-10-17; see `docs/reports/04-design-photos.md` for the hashes.
