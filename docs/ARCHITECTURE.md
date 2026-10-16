# Architecture

Exquisite Barber & Beauty Lounge: website and booking system. This document
describes the whole system, including the parts that later prompts build. When
code and this document disagree, fix one of them in the same change.

Contents

1. Overview and principles
2. Folder structure
3. Data model (every collection, every index)
4. Double booking prevention
5. API contract
6. Availability rules and settings
7. Customer manage link
8. Authentication and sessions
9. Notifications: outbox and channels
10. Future features: gift cards, rewards, SMS
11. Operations: environments, deployment, scripts
12. Risks and open questions

---

## 1. Overview and principles

- One Vite + React single page app served as static files from Vercel, with one
  serverless function (`api/[...path].ts`) that routes every `/api/*` request
  through `server/http`.
- MongoDB (Atlas in production, mongodb-memory-server in tests) accessed through
  the official driver, one cached client per process, transactions for every
  multi-document write.
- zod schemas in `/shared` are the single definition of every document and every
  request or response. The server validates all input; the client validates all
  responses it renders.
- Times are UTC `Date` values in the database and ISO strings on the wire.
  Shop-local dates and wall-clock times exist only at the edges and go through
  `shared/lib/time.ts` (Luxon, `America/New_York`).
- Money is integer cents everywhere. Formatting happens in the UI and in emails.
- Staff and services are soft deleted. Bookings snapshot the services they were
  made with, so editing a price never rewrites history.
- Ids are 24-character hex strings (`newId()`), identical in the database, the
  API and the client. No ObjectId conversion layer.
- Every mutating request from a browser passes an Origin check. Owner and barber
  routes also require a session cookie. Public booking routes are rate limited and
  idempotent.

## 2. Folder structure

```
api/                 Vercel entry points. One catch-all function. Zero logic.
server/              Everything that runs on the server.
  env.ts             Lazy, zod-validated environment.
  db/                client (cached MongoClient), transaction (withTransaction),
                     indexes (the index registry), collections (typed access).
  repos/             One module per collection. The only code that touches the
                     driver. Validates documents with the shared schemas.
  services/          Business logic composed from repos inside transactions
                     (seedService now; booking, availability, auth, outbox later).
  http/              router, request parsing, the one error responder, the
                     Origin guard, route modules under http/routes/.
  lib/               errors, logger, ids, manageToken, small utilities.
shared/              Imported by both client and server. No Node or DOM APIs.
  lib/               constants, time, money, phone, slug, referenceCode.
  schemas/           zod document schemas and the input schemas derived from them.
  api/               zod request and response schemas plus the error contract.
src/                 The React app.
  app/               App (routes) and layouts.
  pages/             One component per route.
  components/        Shared UI. Each has an exq-* class prefix and data-state.
  lib/               api client, hooks.
  styles/            reset.css only until the design pass.
scripts/             tsx scripts: indexes, seed, dev servers.
seed/                shop.ts: every placeholder value, marked PLACEHOLDER.
tests/               unit/ (pure helpers), integration/ (repos and HTTP against a
                     real replica set), helpers/ (global setup, db, fixtures).
docs/                This file and docs/reports/NN-*.md task reports.
```

Import rules: `src` may import `shared`. `server`, `api`, `scripts`, `seed` and
`tests` may import `shared` and `server`. `shared` imports nothing from the other
folders. `api` and `server` use relative imports so the Vercel runtime never has
to resolve path aliases; `src` and `tests` may use `@shared/*`, `@server/*`, `@/*`.

## 3. Data model

All collections live in one database. `_id` is a string unless stated. Every
timestamp is a BSON Date in UTC. Index definitions are the source of truth in
`server/db/indexes.ts`; the tables below mirror them.

### shopSettings (singleton, `_id: "shop"`)

| Field                | Type                                                                                                      | Notes                 |
| -------------------- | --------------------------------------------------------------------------------------------------------- | --------------------- |
| name, tagline        | string                                                                                                    |                       |
| address              | { line1, line2 or null, city, state, postalCode }                                                         |                       |
| phone                | E.164 string                                                                                              |                       |
| email                | string                                                                                                    |                       |
| instagramHandle      | string                                                                                                    | without @             |
| websiteUrl           | string or null                                                                                            |                       |
| timezone             | "America/New_York"                                                                                        | fixed                 |
| booking              | BookingSettings                                                                                           | see section 6         |
| notifications        | { ownerAlertEmail, fromName, replyToEmail, customerConfirmationEmail, ownerNewBookingEmail, customerSms } |                       |
| features             | { giftCards, rewards, smsReminders }                                                                      | all false until built |
| createdAt, updatedAt | Date                                                                                                      |                       |

Indexes: none beyond `_id`.

### staff

| Field                       | Type                   | Notes                                                    |
| --------------------------- | ---------------------- | -------------------------------------------------------- |
| slug                        | string                 | current public slug                                      |
| slugAliases                 | string[]               | every former slug, kept forever                          |
| slugKeys                    | string[]               | derived `[slug, ...slugAliases]`, maintained by the repo |
| name, title, specialty, bio | string                 |                                                          |
| role                        | owner, barber, stylist |                                                          |
| chairNumber                 | int or null            |                                                          |
| serviceIds                  | string[]               | services this person performs                            |
| photoUrl, instagramHandle   | string or null         |                                                          |
| sortOrder                   | int                    | display order                                            |
| acceptsOnlineBooking        | boolean                | false means walk-in only                                 |
| showOnWebsite               | boolean                |                                                          |
| deletedAt                   | Date or null           | soft delete                                              |
| createdAt, updatedAt        | Date                   |                                                          |

| Index                            | Keys                                | Why                                                                                                     |
| -------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| uniq_slugKeys (unique, multikey) | slugKeys                            | no slug, current or former, can belong to two people. This is what makes printed QR codes safe forever. |
| public_listing                   | deletedAt, showOnWebsite, sortOrder | public team page                                                                                        |

Daily "in or out" toggles are not fields on staff; they are `timeBlocks` of kind
`dayOff` or `extraHours` for that date, so history is kept and nothing is lost
when the day passes.

### services

| Field                | Type               | Notes                 |
| -------------------- | ------------------ | --------------------- |
| name, description    | string             |                       |
| group                | Barber, Beauty     |                       |
| priceCents           | int                |                       |
| priceFrom            | boolean            | "From $x"             |
| durationMinutes      | int, multiple of 5 |                       |
| sortOrder            | int                |                       |
| isActive             | boolean            | hide without deleting |
| deletedAt            | Date or null       | soft delete           |
| createdAt, updatedAt | Date               |                       |

| Index          | Keys                                  | Why        |
| -------------- | ------------------------------------- | ---------- |
| public_listing | deletedAt, isActive, group, sortOrder | menu query |

### weeklyHours

One document per subject: the shop (`staffId: null`) or one staff member.

| Field       | Type                                             | Notes                    |
| ----------- | ------------------------------------------------ | ------------------------ |
| subjectType | shop, staff                                      |                          |
| staffId     | string or null                                   |                          |
| days        | { mon..sun: [{ start: "HH:mm", end: "HH:mm" }] } | empty array = closed/off |
| updatedAt   | Date                                             |                          |

| Index                 | Keys                 | Why                                    |
| --------------------- | -------------------- | -------------------------------------- |
| uniq_subject (unique) | subjectType, staffId | exactly one hours document per subject |

### closures

Shop-wide exceptions to weekly hours. One document per calendar day.

| Field     | Type                 | Notes                                                |
| --------- | -------------------- | ---------------------------------------------------- |
| date      | "YYYY-MM-DD"         | shop-local                                           |
| kind      | closed, specialHours |                                                      |
| intervals | [{ start, end }]     | only for specialHours; replaces the day's shop hours |
| label     | string               | "Christmas Day"                                      |
| createdAt | Date                 |                                                      |

| Index              | Keys | Why                                            |
| ------------------ | ---- | ---------------------------------------------- |
| uniq_date (unique) | date | one exception per day; availability lookup key |

### timeBlocks

Per-staff unavailability and extra availability.

| Field          | Type                               | Notes     |
| -------------- | ---------------------------------- | --------- |
| staffId        | string                             |           |
| kind           | timeOff, block, dayOff, extraHours | see below |
| startAt, endAt | Date                               | UTC       |
| reason         | string or null                     |           |
| createdBy      | { type, userId, staffId }          |           |
| createdAt      | Date                               |           |

Kinds: `timeOff` is a vacation or multi-day absence; `block` is a short blocked
period (lunch, a walk-in in the chair) and takes slot locks; `dayOff` is the
owner toggling someone out for one day; `extraHours` is the owner toggling someone
in on a day they do not normally work, with the hours in startAt and endAt.

| Index       | Keys                    | Why                                   |
| ----------- | ----------------------- | ------------------------------------- |
| staff_range | staffId, startAt, endAt | availability and one chair's schedule |
| by_start    | startAt                 | shop-wide day view                    |

### bookings

| Field                | Type                                                                 | Notes                                                   |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| referenceCode        | "ABC-DEFG"                                                           | unique, alphabet without 0 O 1 I                        |
| staffId              | string                                                               | the chair                                               |
| staffRequested       | boolean                                                              | false when "first available" chose the chair            |
| services             | [{ serviceId, name, group, priceCents, priceFrom, durationMinutes }] | snapshot at booking time                                |
| startAt, endAt       | Date                                                                 | UTC                                                     |
| durationMinutes      | int                                                                  | sum of services                                         |
| bufferMinutes        | int                                                                  | buffer applied after this booking, captured at creation |
| totalPriceCents      | int                                                                  |                                                         |
| customer             | { name, phone (E.164), email or null }                               |                                                         |
| status               | confirmed, cancelled, completed, noShow                              |                                                         |
| source               | online, walkIn, owner, barber                                        |                                                         |
| notes                | string or null                                                       |                                                         |
| cancellation         | { at, by, reason } or null                                           |                                                         |
| rescheduledFromId    | string or null                                                       |                                                         |
| manageTokenVersion   | int                                                                  | bumped on cancel and reschedule                         |
| createdAt, updatedAt | Date                                                                 |                                                         |

| Index                       | Keys                         | Why                                             |
| --------------------------- | ---------------------------- | ----------------------------------------------- |
| uniq_referenceCode (unique) | referenceCode                | human handle must be unique                     |
| staff_start                 | staffId, startAt             | one chair's day; availability reads             |
| start_status                | startAt, status              | owner's day view; reminder jobs                 |
| customer_phone              | customer.phone, startAt desc | open-bookings-per-phone guard; customer history |

Reserved for later (not present yet, additive): `payment` subdocument for gift
card redemption, `rewardsStampId`, `reminders: { smsSentAt }`.

### slotLocks

| Field      | Type               | Notes                                       |
| ---------- | ------------------ | ------------------------------------------- |
| staffId    | string             |                                             |
| slotStart  | Date               | start of a 15 minute block, on the UTC grid |
| holderType | booking, timeBlock |                                             |
| holderId   | string             | booking or time block id                    |
| createdAt  | Date               |                                             |

| Index                    | Keys               | Why                                         |
| ------------------------ | ------------------ | ------------------------------------------- |
| uniq_staff_slot (unique) | staffId, slotStart | the double booking guard                    |
| by_holder                | holderId           | release all locks of a holder in one delete |

### users

| Field                | Type              | Notes                              |
| -------------------- | ----------------- | ---------------------------------- |
| email                | string, lowercase | login identity                     |
| passwordHash         | string            | argon2id PHC string                |
| role                 | owner, barber     |                                    |
| staffId              | string or null    | barbers link to their staff record |
| isActive             | boolean           |                                    |
| failedLoginCount     | int               |                                    |
| lockedUntil          | Date or null      |                                    |
| lastLoginAt          | Date or null      |                                    |
| passwordChangedAt    | Date              |                                    |
| createdAt, updatedAt | Date              |                                    |

| Index                                        | Keys    | Why                         |
| -------------------------------------------- | ------- | --------------------------- |
| uniq_email (unique)                          | email   | login                       |
| by_staff (unique, partial on string staffId) | staffId | at most one login per chair |

### sessions

| Field                 | Type           | Notes                            |
| --------------------- | -------------- | -------------------------------- |
| tokenHash             | hex sha256     | the cookie value is never stored |
| userId                | string         |                                  |
| createdAt, lastSeenAt | Date           |                                  |
| expiresAt             | Date           | sliding                          |
| ip, userAgent         | string or null |                                  |
| revokedAt             | Date or null   |                                  |

| Index                   | Keys      | Why                                   |
| ----------------------- | --------- | ------------------------------------- |
| uniq_tokenHash (unique) | tokenHash | lookup on every authenticated request |
| ttl_expiresAt (TTL 0s)  | expiresAt | MongoDB deletes expired sessions      |
| by_user                 | userId    | revoke all for a user                 |

### auditLog

| Field                | Type                                                       | Notes                |
| -------------------- | ---------------------------------------------------------- | -------------------- |
| at                   | Date                                                       |                      |
| actor                | { type: owner, barber, customer, system; userId; staffId } |                      |
| action               | "booking.create", "staff.slug.rename", ...                 |                      |
| entityType, entityId | string                                                     |                      |
| before, after        | unknown or null                                            | relevant fields only |
| meta                 | object or null                                             |                      |
| requestId            | string or null                                             |                      |

| Index          | Keys                          | Why                  |
| -------------- | ----------------------------- | -------------------- |
| entity_history | entityType, entityId, at desc | one record's history |
| by_time        | at desc                       | owner audit screen   |

### emailOutbox

| Field                 | Type                                                                                                                                   | Notes                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| channel               | email (sms reserved)                                                                                                                   |                                      |
| to                    | string                                                                                                                                 |                                      |
| template              | bookingConfirmed, bookingRescheduled, bookingCancelled, ownerNewBooking, ownerBookingCancelled, ownerBookingRescheduled, passwordReset |                                      |
| payload               | object                                                                                                                                 | template data; rendered at send time |
| status                | pending, sending, sent, failed                                                                                                         |                                      |
| attempts, maxAttempts | int                                                                                                                                    |                                      |
| lastError             | string or null                                                                                                                         |                                      |
| nextAttemptAt         | Date                                                                                                                                   | exponential backoff                  |
| sentAt                | Date or null                                                                                                                           |                                      |
| dedupeKey             | string or null                                                                                                                         | unique when present                  |
| bookingId             | string or null                                                                                                                         |                                      |
| createdAt, updatedAt  | Date                                                                                                                                   |                                      |

| Index                            | Keys                      | Why                                    |
| -------------------------------- | ------------------------- | -------------------------------------- |
| delivery_queue                   | status, nextAttemptAt     | the deliverer's pick query             |
| uniq_dedupeKey (unique, partial) | dedupeKey                 | never send the same notification twice |
| by_booking                       | bookingId, createdAt desc | owner sees what was sent               |

### idempotencyKeys

| Field                | Type                     | Notes                           |
| -------------------- | ------------------------ | ------------------------------- |
| scope                | string                   | route name                      |
| key                  | string                   | from the Idempotency-Key header |
| requestHash          | hex sha256               | of the canonical body           |
| status               | inProgress, completed    |                                 |
| response             | { status, body } or null | replayed to retries             |
| createdAt, expiresAt | Date                     | 24 hours                        |

| Index                   | Keys       | Why                                    |
| ----------------------- | ---------- | -------------------------------------- |
| uniq_scope_key (unique) | scope, key | atomic claim across concurrent retries |
| ttl_expiresAt (TTL 0s)  | expiresAt  | automatic cleanup                      |

### rateLimits

| Field       | Type                                | Notes        |
| ----------- | ----------------------------------- | ------------ |
| key         | "login:ip:...", "booking:phone:..." |              |
| windowStart | Date                                | fixed window |
| count       | int                                 |              |
| expiresAt   | Date                                | window end   |

| Index                    | Keys             | Why                                   |
| ------------------------ | ---------------- | ------------------------------------- |
| uniq_key_window (unique) | key, windowStart | concurrent hits increment one counter |
| ttl_expiresAt (TTL 0s)   | expiresAt        | automatic cleanup                     |

## 4. Double booking prevention

A chair cannot hold two things at once because the database refuses it, not
because code checked first.

Mechanism

1. Time is divided into 15 minute blocks on the UTC grid (`LOCK_GRANULARITY_MINUTES`).
   New York offsets are whole hours, so the grid is the same in shop time across
   DST. Customer-facing start times use `slotStepMinutes`, which must be a
   multiple of 15.
2. A booking covering `[startAt, endAt + bufferMinutes)` needs one `slotLocks`
   document per block in that range (`lockSlotStarts`). The range is widened
   outward to the grid so a 20 minute service locks two blocks.
3. `slotLocks` has a unique index on `(staffId, slotStart)`.
4. Creating a booking runs inside one transaction: insert the booking, insert the
   locks (`insertMany`, ordered), append the audit entry, enqueue the outbox
   messages. Any duplicate key aborts the transaction and nothing is written.
5. Cancelling runs inside one transaction: update the booking status, delete all
   locks for that `holderId`, audit, enqueue.
6. Rescheduling runs inside one transaction: acquire locks for the new range
   (possibly on a different chair), delete the old locks, update the booking,
   audit, enqueue. If the new range is taken the whole thing aborts and the old
   booking is untouched.
7. Short time blocks (`kind: "block"`, walk-ins, lunch) take locks the same way
   with `holderType: "timeBlock"`, so an online booking cannot land on a walk-in
   and a walk-in cannot be entered over an online booking. Whole-day kinds
   (`timeOff`, `dayOff`) do not take locks; the availability engine excludes them,
   and when the owner creates one the service lists the bookings it collides with
   so they can be moved.

Failure modes and handling

| Failure                                              | What happens                                                   | Handling                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Two customers submit the same chair and slot at once | Both transactions insert locks; the second insert hits E11000  | Second transaction aborts; API returns 409 SLOT_TAKEN; UI refreshes availability         |
| Write conflict between concurrent transactions       | Driver raises TransientTransactionError                        | `session.withTransaction` retries; `withTransaction` adds 3 outer retries                |
| Process dies after commit, before the response       | Client never sees the confirmation                             | Client retries with the same Idempotency-Key and receives the stored response            |
| Process dies before commit                           | Transaction never commits                                      | MongoDB aborts it after transactionLifetimeLimitSeconds (60s default); no partial writes |
| Lock insert succeeds but booking insert fails        | Impossible to leave locks behind: same transaction             | Nothing to do                                                                            |
| Orphaned lock (manual data edit)                     | A slot looks taken with no booking                             | `scripts/locks-audit.ts` (later) lists locks whose holder is missing; owner can clear    |
| Owner changes slotStepMinutes                        | Old locks on the 15 grid remain valid for any multiple of 15   | Allowed values are constrained by the schema                                             |
| Owner changes bufferMinutes                          | Existing bookings keep their captured buffer                   | New bookings use the new value                                                           |
| Clock skew between app instances                     | Lock keys are derived from the requested start, not from `now` | Only lead time checks use `now`, with a 60s tolerance                                    |
| Service duration edited after booking                | Booking keeps its snapshot and its locks                       | Nothing changes                                                                          |

## 5. API contract

Base path `/api`. JSON in and out. Auth levels: `public`, `barber` (any signed-in
staff; barber routes are scoped to the caller's own staffId), `owner`, `internal`
(bearer `CRON_SECRET`).

Common behaviour

- Every response carries `X-Request-Id`.
- Mutating methods require an allowed `Origin` (or no Origin with a same-origin
  `Sec-Fetch-Site`), else 403 ORIGIN_NOT_ALLOWED.
- Bodies over 64 KB: 413. Non-JSON content type: 415.
- Error body, always:

```json
{
  "error": {
    "code": "SLOT_TAKEN",
    "message": "That time is no longer available",
    "details": [{ "path": "customer.phone", "message": "Enter a valid US phone number" }],
    "requestId": "a1b2c3d4e5f60718",
    "retryAfterSeconds": 30
  }
}
```

`details` appears only for VALIDATION_ERROR; `retryAfterSeconds` only for
RATE_LIMITED and ACCOUNT_LOCKED (also sent as a `Retry-After` header).

Error codes and HTTP status (`shared/api/errors.ts`): VALIDATION_ERROR 400,
BAD_REQUEST 400, AUTH_REQUIRED 401, INVALID_CREDENTIALS 401, SESSION_EXPIRED 401,
FORBIDDEN 403, ORIGIN_NOT_ALLOWED 403, INVALID_TOKEN 403, TOKEN_EXPIRED 403,
NOT_FOUND 404, METHOD_NOT_ALLOWED 405, CONFLICT 409, SLOT_TAKEN 409,
SLUG_TAKEN 409, IDEMPOTENCY_MISMATCH 409, IDEMPOTENCY_IN_PROGRESS 409,
BOOKING_NOT_CANCELLABLE 409, BOOKING_NOT_RESCHEDULABLE 409, SHOP_CLOSED 409,
OUTSIDE_BOOKING_WINDOW 409, STAFF_UNAVAILABLE 409, SERVICE_UNAVAILABLE 409,
TOO_MANY_OPEN_BOOKINGS 409, PAYLOAD_TOO_LARGE 413, UNSUPPORTED_MEDIA_TYPE 415,
ACCOUNT_LOCKED 423, RATE_LIMITED 429, INTERNAL_ERROR 500, NOT_IMPLEMENTED 501,
DATABASE_UNAVAILABLE 503.

### Built in prompt 1

| Method | Path             | Auth   | Request       | Response                                                          |
| ------ | ---------------- | ------ | ------------- | ----------------------------------------------------------------- |
| GET    | /api/health      | public | none          | `healthResponseSchema` (200 ok, 503 degraded)                     |
| GET    | /api/shop        | public | none          | `publicShopSchema`                                                |
| GET    | /api/services    | public | none          | `{ services: PublicService[] }`                                   |
| GET    | /api/staff       | public | none          | `{ staff: PublicStaff[] }`                                        |
| GET    | /api/staff/:slug | public | slug or alias | `{ staff, requestedSlug, canonical }`; 404 when deleted or hidden |

### Prompt 2: availability and booking

| Method | Path                            | Auth                                                    | Request                                                        | Response and errors                                                                                                                                                                                             |
| ------ | ------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/availability               | public                                                  | query `availabilityQuerySchema` (date, serviceIds, staff)      | `availabilityResponseSchema`; SERVICE_UNAVAILABLE, STAFF_UNAVAILABLE                                                                                                                                            |
| GET    | /api/availability/days          | public                                                  | query `availabilityDaysQuerySchema` (month, serviceIds, staff) | `availabilityDaysResponseSchema`                                                                                                                                                                                |
| POST   | /api/bookings                   | public, rate limited, `Idempotency-Key` header required | `createBookingRequestSchema`                                   | 201 `createBookingResponseSchema`; SLOT_TAKEN, SHOP_CLOSED, OUTSIDE_BOOKING_WINDOW, STAFF_UNAVAILABLE, SERVICE_UNAVAILABLE, TOO_MANY_OPEN_BOOKINGS, IDEMPOTENCY_MISMATCH, IDEMPOTENCY_IN_PROGRESS, RATE_LIMITED |
| GET    | /api/bookings/manage            | public (signed token)                                   | query `manageTokenQuerySchema`                                 | `manageBookingResponseSchema`; INVALID_TOKEN, TOKEN_EXPIRED, NOT_FOUND                                                                                                                                          |
| POST   | /api/bookings/manage/cancel     | public (signed token)                                   | `cancelBookingRequestSchema`                                   | `manageBookingResponseSchema`; BOOKING_NOT_CANCELLABLE                                                                                                                                                          |
| POST   | /api/bookings/manage/reschedule | public (signed token)                                   | `rescheduleBookingRequestSchema`                               | `rescheduleBookingResponseSchema` (new manage path); BOOKING_NOT_RESCHEDULABLE, SLOT_TAKEN                                                                                                                      |
| POST   | /api/internal/outbox/deliver    | internal                                                | none                                                           | `{ sent, failed, remaining }`                                                                                                                                                                                   |

Rate limits (defaults): POST /api/bookings 10 per IP per 10 minutes and 5 per
phone per day; manage endpoints 30 per IP per 10 minutes.

### Prompt 3: auth, barber and owner

| Method | Path                               | Auth                 | Request                                                                                   | Response and errors                                                                    |
| ------ | ---------------------------------- | -------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| POST   | /api/auth/login                    | public, rate limited | `{ email, password }`                                                                     | `{ user: PublicUser }` + Set-Cookie; INVALID_CREDENTIALS, ACCOUNT_LOCKED, RATE_LIMITED |
| POST   | /api/auth/logout                   | barber               | none                                                                                      | `{ ok: true }`                                                                         |
| GET    | /api/auth/me                       | barber               | none                                                                                      | `{ user: PublicUser, staff: PublicStaff or null }`                                     |
| POST   | /api/auth/change-password          | barber               | `{ currentPassword, newPassword }`                                                        | `{ ok: true }`; INVALID_CREDENTIALS                                                    |
| GET    | /api/me/schedule                   | barber               | query `{ date }`                                                                          | `{ date, bookings: BookingView[], timeBlocks }` for the caller's chair only            |
| GET    | /api/me/bookings/:id               | barber               |                                                                                           | `{ booking }`; FORBIDDEN if another chair                                              |
| POST   | /api/me/bookings/:id/status        | barber               | `{ status: completed or noShow }`                                                         | `{ booking }`                                                                          |
| GET    | /api/admin/schedule                | owner                | query `{ date }`                                                                          | all chairs for the day with bookings and blocks                                        |
| GET    | /api/admin/bookings                | owner                | query `{ from, to, staffId?, status?, q? }`                                               | `{ bookings, total }`                                                                  |
| GET    | /api/admin/bookings/:id            | owner                |                                                                                           | `{ booking, audit, outbox }`                                                           |
| POST   | /api/admin/bookings                | owner                | `{ staffId, serviceIds, startAt, customer, source: walkIn or owner, notes?, sendEmail? }` | 201 `{ booking }`; SLOT_TAKEN                                                          |
| PATCH  | /api/admin/bookings/:id            | owner                | `{ notes?, status? }`                                                                     | `{ booking }`                                                                          |
| POST   | /api/admin/bookings/:id/cancel     | owner                | `{ reason?, notify? }`                                                                    | `{ booking }`                                                                          |
| POST   | /api/admin/bookings/:id/reschedule | owner                | `{ staffId?, startAt, notify? }`                                                          | `{ booking }`; SLOT_TAKEN                                                              |
| GET    | /api/admin/time-blocks             | owner                | query `{ from, to, staffId? }`                                                            | `{ timeBlocks }`                                                                       |
| POST   | /api/admin/time-blocks             | owner                | `{ staffId, kind, startAt, endAt, reason? }`                                              | 201 `{ timeBlock, conflicts: BookingView[] }`; SLOT_TAKEN for kind block               |
| DELETE | /api/admin/time-blocks/:id         | owner                |                                                                                           | `{ ok: true }`                                                                         |
| POST   | /api/admin/staff/:id/day-status    | owner                | `{ date, status: in or out, start?, end? }`                                               | `{ timeBlock or null, conflicts }`                                                     |
| GET    | /api/admin/services                | owner                |                                                                                           | `{ services }` including inactive, excluding deleted                                   |
| POST   | /api/admin/services                | owner                | `serviceInputSchema`                                                                      | 201 `{ service }`                                                                      |
| PATCH  | /api/admin/services/:id            | owner                | `serviceUpdateSchema`                                                                     | `{ service }`                                                                          |
| DELETE | /api/admin/services/:id            | owner                |                                                                                           | `{ service }` soft deleted                                                             |
| GET    | /api/admin/staff                   | owner                |                                                                                           | `{ staff }`                                                                            |
| POST   | /api/admin/staff                   | owner                | `staffInputSchema`                                                                        | 201 `{ staff }`; SLUG_TAKEN                                                            |
| PATCH  | /api/admin/staff/:id               | owner                | `staffUpdateSchema` (no slug)                                                             | `{ staff }`                                                                            |
| POST   | /api/admin/staff/:id/slug          | owner                | `{ slug }`                                                                                | `{ staff }`; SLUG_TAKEN                                                                |
| DELETE | /api/admin/staff/:id               | owner                |                                                                                           | `{ staff }` soft deleted; future bookings listed in audit                              |
| GET    | /api/admin/hours                   | owner                |                                                                                           | `{ shop: WeekHours, staff: Record<staffId, WeekHours> }`                               |
| PUT    | /api/admin/hours                   | owner                | `weeklyHoursInputSchema`                                                                  | `{ hours }`                                                                            |
| PUT    | /api/admin/staff/:id/hours         | owner                | `weeklyHoursInputSchema`                                                                  | `{ hours }`                                                                            |
| GET    | /api/admin/closures                | owner                | query `{ from, to }`                                                                      | `{ closures }`                                                                         |
| PUT    | /api/admin/closures                | owner                | `closureInputSchema`                                                                      | `{ closure }` upsert by date                                                           |
| DELETE | /api/admin/closures/:id            | owner                |                                                                                           | `{ ok: true }`                                                                         |
| GET    | /api/admin/settings                | owner                |                                                                                           | `{ settings }`                                                                         |
| PATCH  | /api/admin/settings                | owner                | partial `shopSettingsInputSchema`                                                         | `{ settings }`                                                                         |
| GET    | /api/admin/users                   | owner                |                                                                                           | `{ users: PublicUser[] }`                                                              |
| POST   | /api/admin/users                   | owner                | `{ email, role, staffId, password }`                                                      | 201 `{ user }`; CONFLICT                                                               |
| PATCH  | /api/admin/users/:id               | owner                | `{ isActive?, password? }`                                                                | `{ user }`                                                                             |
| GET    | /api/admin/audit                   | owner                | query `{ entityType?, entityId?, limit? }`                                                | `{ entries }`                                                                          |
| GET    | /api/admin/outbox                  | owner                | query `{ status? }`                                                                       | `{ messages }`                                                                         |
| POST   | /api/admin/outbox/:id/retry        | owner                |                                                                                           | `{ ok: true }`                                                                         |

Owners can call every barber route. Barber routes always scope to
`principal.staffId`; a barber with no linked staff record gets FORBIDDEN.

## 6. Availability rules and settings

The availability engine (prompt 2, `server/services/availability.ts`) answers:
for a date, a list of services and a chair (or "any"), which start times are
bookable. It is pure given its inputs so it can be unit tested without a database.

Inputs: shop settings, shop weekly hours, the closure for that date, each chair's
weekly hours, each chair's time blocks for the day, each chair's existing locks
for the day, the service list (durations, which chairs perform them), `now`.

Algorithm

1. Resolve the shop's open intervals for the date: the closure's `specialHours`
   if present, nothing if `closed`, else the weekly hours for that weekday.
2. For each candidate chair (the requested one, or every chair that accepts
   online booking and performs all requested services): intersect the chair's
   weekly hours with the shop intervals; apply `extraHours` blocks as additional
   intervals (still clipped to shop hours); remove `timeOff` and `dayOff` ranges.
3. Total duration = sum of service durations, performed back to back by the same
   chair (multi-service chaining). Locked range = duration + bufferMinutes.
4. Candidate starts: every `slotStepMinutes` step within each open interval where
   start + duration fits inside the interval.
5. Drop starts earlier than `now + leadTimeMinutes` and dates beyond
   `now + bookingWindowDays`.
6. Drop starts whose locked range overlaps any existing lock (bookings and
   blocks) for that chair.
7. For "first available", merge the chairs' slots by start time. For each start
   with more than one free chair pick by `firstAvailableStrategy`:
   `leastBookedThatDay` chooses the chair with the fewest confirmed minutes that
   day (ties by `sortOrder`), spreading work fairly; `roundRobin` cycles by
   `sortOrder` from the last assigned chair. The chosen `staffId` is returned
   with each slot so the booking request names a chair explicitly. The booking
   service re-validates and, if that chair was taken in the meantime, tries the
   next free chair for that start before returning SLOT_TAKEN.
8. The response includes `closedReason` ("Closed on Mondays", "Closed for
   Christmas Day", "Fully booked") when no slots exist.

Settings (all in `shopSettings.booking`, owner-editable)

| Setting                 | Default            | Meaning                                         |
| ----------------------- | ------------------ | ----------------------------------------------- |
| slotStepMinutes         | 15                 | start-time granularity; multiple of 15          |
| bufferMinutes           | 0                  | cleanup gap locked after every booking          |
| leadTimeMinutes         | 60                 | earliest online start relative to now           |
| bookingWindowDays       | 30                 | how far ahead customers may book                |
| cancelCutoffMinutes     | 120                | customers cannot cancel online closer than this |
| rescheduleCutoffMinutes | 120                | same for reschedule                             |
| maxServicesPerBooking   | 3                  |                                                 |
| allowFirstAvailable     | true               | show the "first available" option               |
| firstAvailableStrategy  | leastBookedThatDay | or roundRobin                                   |
| requireEmail            | false              | email optional at checkout                      |
| maxOpenBookingsPerPhone | 3                  | confirmed future bookings a phone may hold      |

Owner and barber bookings (walk-ins, manual entries) bypass lead time, booking
window and the per-phone cap, but never bypass locks.

## 7. Customer manage link

Format `v1.<payload>.<signature>` where `payload` is base64url of
`{ "b": bookingId, "v": manageTokenVersion, "exp": unixSeconds }` and `signature`
is base64url of HMAC-SHA256 over `"v1." + payload` with `MANAGE_LINK_SECRET`.

- Issued inside the confirmation email as `APP_BASE_URL/manage?token=...`. The
  token is only ever in the query string of that page and in POST bodies, never in
  a path, so it does not appear in access logs as part of the route.
- Expiry: booking `endAt` plus 7 days, so the page still shows a finished booking
  for a week and then stops answering.
- Verification: constant-time signature compare, then expiry, then the booking is
  loaded and `v` must equal the booking's current `manageTokenVersion`. Cancel and
  reschedule bump the version, so every earlier link stops working and the new
  confirmation carries a fresh link.
- Allows: view the booking; cancel if `now < startAt - cancelCutoffMinutes`;
  reschedule under the same rule with `rescheduleCutoffMinutes`. Nothing else: no
  customer data edits, no access to other bookings.
- Rotation of `MANAGE_LINK_SECRET` invalidates every outstanding link; customers
  can still call the shop. Acceptable for a one-shop deployment.

## 8. Authentication and sessions (prompt 3)

- Two roles, owner and barber. Barber logins are created by the owner and linked
  to a staff record. No self-signup, no customer accounts.
- Passwords hashed with argon2id (`argon2` package): memory 64 MiB, 3 iterations,
  parallelism 1. Minimum 10 characters; the owner can reset any barber password.
- Sessions are opaque 256-bit random tokens (`randomToken()`). Only the SHA-256
  of the token is stored (`sessions.tokenHash`). Cookie `exq_session`: HttpOnly,
  Secure (outside local dev), SameSite=Lax, Path=/, 30 day sliding expiry
  refreshed when more than a day has passed since `lastSeenAt`.
- Every authenticated request: read cookie, hash, `findActiveSession`, load the
  user, check `isActive`, build the `Principal`. Logout revokes the session;
  password change revokes every session of that user.
- CSRF: SameSite=Lax plus the Origin check on all mutating requests. No separate
  CSRF token is needed because the API only accepts JSON and never form posts.
- Login limits: 10 attempts per IP per 15 minutes (`rateLimits`), and per account
  5 failures lock the account for 15 minutes (`users.lockedUntil`). Failures
  return the same INVALID_CREDENTIALS message whether or not the email exists.
- The router already denies every non-public route; the auth prompt replaces
  `denyAllAuthenticator` with the cookie authenticator and nothing else changes.

## 9. Notifications: outbox and channels

Pattern

1. The transaction that creates, cancels or moves a booking also inserts outbox
   rows (`enqueueOutboxMessage`) with a `dedupeKey` such as
   `booking:<id>:confirmed:v1`. Booking and notification are committed together.
2. Delivery is separate: `deliverOutbox()` claims one pending row at a time by
   flipping it to `sending` (atomic `findOneAndUpdate`), renders the template,
   calls the channel, then marks it sent or failed. Failed rows retry with
   exponential backoff (2, 4, 8 ... minutes, capped at 60) up to `maxAttempts`,
   then park as `failed` where the owner can retry them.
3. Triggers: right after a booking request commits, the handler runs
   `deliverOutbox()` once before responding (best effort, bounded to a few
   seconds); a Vercel Cron hits `/api/internal/outbox/deliver` as a backstop; any
   admin request may also drain a few messages opportunistically.

Channel interface (`server/notifications/channel.ts`)

```ts
interface NotificationChannel {
  readonly channel: 'email' | 'sms';
  send(
    message: RenderedMessage,
  ): Promise<{ ok: true; providerId: string } | { ok: false; error: string; retryable: boolean }>;
}
```

Email implementations: `LogEmailChannel` (dev and tests, writes to the log) and
`ResendEmailChannel` (production). Templates are plain text plus simple HTML in
`server/notifications/templates/`, rendered from `payload` at send time.

## 10. Future features

Gift cards (card payments)

- New collections: `giftCards` (code, initialCents, balanceCents, purchaser,
  recipient, status, stripePaymentIntentId, expiresAt) and `giftCardTransactions`
  (giftCardId, bookingId or null, deltaCents, kind: purchase, redeem, refund,
  adjust). Balance changes run in transactions with an optimistic version field.
- Payment provider: Stripe Checkout for purchase (no card data touches our
  servers), webhook `/api/webhooks/stripe` (internal auth by signature) marks the
  card paid. Redemption at the chair is owner-only via the dashboard, writing a
  `payment` subdocument onto the booking.
- Feature flag `features.giftCards` gates the public page and the nav link.

Rewards punch card

- New collection `rewardsCards` keyed by customer phone (E.164): stamps[], earned
  rewards, redeemedAt. A stamp is added when a booking is marked `completed`
  (service `rewardsService.onBookingCompleted`, called from the same transaction).
  Rules (stamps per reward, eligible services) live in `shopSettings.rewards`.
- Customers look up their card with phone plus the reference code of any past
  booking, or through the manage link. No accounts.

SMS reminders

- `SmsChannel` implements `NotificationChannel` with Twilio. Outbox rows use
  `channel: "sms"` and `to` as E.164; the outbox schema already allows it.
- A cron-driven `reminderService` enqueues `bookingReminder` rows 24 hours before
  `startAt` for confirmed bookings (query uses the `start_status` index) with
  dedupeKey `booking:<id>:reminder24h`.
- Consent: a `customer.smsOptIn` boolean on bookings and a STOP handler webhook.
  `features.smsReminders` gates it all.

## 11. Operations

Environments

| Variable                                      | Needed          | Purpose                                |
| --------------------------------------------- | --------------- | -------------------------------------- |
| MONGODB_URI                                   | now             | replica set connection string          |
| MONGODB_DB_NAME                               | now             | database name per environment          |
| APP_BASE_URL                                  | now             | manage links, allowed Origin           |
| MANAGE_LINK_SECRET                            | now             | HMAC key for manage links              |
| EMAIL_PROVIDER                                | later           | log or resend                          |
| RESEND_API_KEY, EMAIL_FROM                    | later           | email delivery                         |
| SEED_OWNER_PASSWORD                           | later           | initial owner login at seed time       |
| CRON_SECRET                                   | later           | bearer token for internal routes       |
| LOG_LEVEL                                     | optional        |                                        |
| MONGOMS_SYSTEM_BINARY                         | optional, tests | use an existing mongod                 |
| VERCEL_GIT_COMMIT_SHA, VERCEL_ENV, VERCEL_URL | set by Vercel   | build sha, environment, preview origin |

Deployment

- Vercel project with the Vite framework preset. `vercel.json` rewrites every
  non-`/api` path to `index.html` and sets CSP and the other security headers.
- The build sha comes from `VERCEL_GIT_COMMIT_SHA` (or `GITHUB_SHA`, or `git
rev-parse HEAD` locally) and is defined as `__BUILD_SHA__` for the client and
  reported by `/api/health` for the server.
- Database: MongoDB Atlas M0 or above. Run `npm run db:indexes` then
  `npm run db:seed` once per environment.
- Local development: `npm run dev` starts Vite on 5173 and the API on 3001; Vite
  proxies `/api` to the API so cookies and Origin behave as in production.

Scripts: `dev`, `build`, `typecheck`, `lint`, `format`, `format:check`, `test`,
`test:watch`, `test:coverage`, `db:indexes`, `db:seed`.

## 12. Risks and open questions

Risks

- Vercel function timeout (10s on Hobby) bounds the in-request outbox delivery;
  the cron backstop covers the rest. On Hobby, crons run at most daily, so a
  failed first attempt could wait a day. Pro plan or a tiny external pinger fixes
  that.
- The client bundle is about 137 KB gzipped, mostly Luxon and zod. Acceptable now;
  route-level code splitting and a lighter date formatter are options later.
- Atlas free tier has no point-in-time restore. Take a daily `mongodump` or use
  M10 before launch.
- `MANAGE_LINK_SECRET` rotation invalidates all links at once.
- CSP allows `'unsafe-inline'` styles to give the design pass room; tighten to
  nonces if the design does not need inline styles.

Open questions for the client

- Real hours for the shop and each chair, real service list with prices and
  durations, which chairs do Beauty services, chair numbers.
- Whether a cleanup buffer between bookings is wanted, and how far ahead booking
  should be open.
- Cancel and reschedule cutoffs (2 hours is the placeholder).
- Owner alert email address and the sending domain for confirmations.
- Final domain name. Whether Instagram photos should feed the gallery.
