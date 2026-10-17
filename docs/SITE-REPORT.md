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

## Routes and sections

| Route         | Sections                                                                                                                   | Status                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| /             | hero, today's chairs, services preview, the work, visit, ink band, footer                                                  | design pass in milestone 3                  |
| /services     | heading, group chips, service rows with Book links                                                                         | milestone 3                                 |
| /chairs       | heading, chair card grid                                                                                                   | milestone 3                                 |
| /chairs/:slug | photo arch, badge, name, role, specialty, next openings, services, work strip, IG, sticky Book                             | milestone 3                                 |
| /gallery      | heading, barber filter chips, photo grid, lightbox                                                                         | milestone 3                                 |
| /visit        | heading, hours table, address, directions, call, policies, parking                                                         | milestone 3                                 |
| /book         | step bar, services, chair, day, time, details, confirm, ticket                                                             | logic from prompt 2; restyle in milestone 4 |
| /manage       | ticket, reschedule, cancel sheet                                                                                           | milestone 4                                 |
| /admin/\*     | sign in, today, schedule, bookings, new booking, block time, who's in, customers, settings, photos, audit, outbox, account | prompt 3; restyle in milestone 4            |
| /kit          | every kit component in every state                                                                                         | development builds only                     |

## Component inventory

See `docs/DESIGN-SYSTEM.md` for the kit table (name, props, states, where used).
Older components still in use until their page is restyled:

- `src/components/Status.tsx`: loading, error and empty line.
- `src/components/booking/*`: ServicePicker, StaffPicker, DayPicker, TimePicker,
  CustomerForm, BookingSummary, IcsDownload, StepHeading.
- `src/admin/components/*`: AdminNav, BookingList, ConflictResolver, BlockTimeForm,
  TimeBlockItem, WeekHoursEditor, ErrorNote.

## Tokens

`src/styles/tokens.css`. Semantic surfaces and type rules in `src/styles/base.css`.

## Data sources and APIs

Public: `GET /api/shop`, `/api/services`, `/api/staff`, `/api/staff/:slug`,
`/api/availability`, `/api/availability/days`, `POST /api/bookings`,
`/api/bookings/manage` (GET, cancel, reschedule). Staff and owner routes are
listed in `docs/ARCHITECTURE.md` section 5.

Env var names (values never written here): MONGODB_URI, MONGODB_DB_NAME,
APP_BASE_URL, MANAGE_LINK_SECRET, CRON_SECRET, EMAIL_PROVIDER, RESEND_API_KEY,
EMAIL_FROM, SEED_OWNER_PASSWORD, SEED_OWNER_EMAIL, LOG_LEVEL,
OUTBOX_AFTER_RESPONSE, MONGOMS_SYSTEM_BINARY. Milestone 2 adds STORAGE_DRIVER,
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
R2_PUBLIC_BASE_URL.

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
- Pages other than the layout chrome keep their unstyled markup until
  milestones 3 and 4.

## Last commit

Milestone 1, see `docs/PROGRESS.md` for the hash and date.
