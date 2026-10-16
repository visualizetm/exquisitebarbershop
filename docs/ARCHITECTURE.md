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

| Field                | Type               | Notes                                                       |
| -------------------- | ------------------ | ----------------------------------------------------------- |
| name, description    | string             |                                                             |
| group                | Barber, Beauty     |                                                             |
| priceCents           | int                |                                                             |
| priceFrom            | boolean            | "From $x"                                                   |
| durationMinutes      | int, multiple of 5 |                                                             |
| bufferMinutes        | int or null        | cleanup gap after this service; null means the shop default |
| sortOrder            | int                |                                                             |
| isActive             | boolean            | hide without deleting                                       |
| deletedAt            | Date or null       | soft delete                                                 |
| createdAt, updatedAt | Date               |                                                             |

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

Learned while building: inside a MongoDB transaction, a duplicate key error
aborts the whole transaction on the server (later operations fail with
NoSuchTransaction). Two consequences shape the code: "first available" fallback
runs one transaction per candidate chair rather than retrying inside one, and
the outbox dedupe check runs a query before the insert instead of catching
E11000.

## 5. API contract

Base path `/api`. JSON in and out. Auth levels: `public`, `barber` (any signed-in
staff; barber routes are scoped to the caller's own staffId), `owner`, `internal`
(`Authorization: Bearer <CRON_SECRET>`).

Common behaviour

- Every response carries `X-Request-Id`.
- Mutating methods require an allowed `Origin` (or no Origin with a same-origin
  `Sec-Fetch-Site`), else 403 ORIGIN_NOT_ALLOWED. The check runs before routing.
- Bodies over 64 KB: 413. Non-JSON content type: 415.
- Error body, always:

```json
{
  "error": {
    "code": "SLOT_TAKEN",
    "message": "That time was just taken. Here are the next open times.",
    "details": [{ "path": "customer.phone", "message": "Enter a valid US phone number" }],
    "requestId": "a1b2c3d4e5f60718",
    "retryAfterSeconds": 30,
    "alternatives": [{ "startAt": "...", "endAt": "...", "staffId": "..." }]
  }
}
```

`details` appears only for VALIDATION_ERROR; `retryAfterSeconds` only for
RATE_LIMITED and ACCOUNT_LOCKED (also sent as a `Retry-After` header);
`alternatives` only for SLOT_TAKEN (up to five next open times).

Error codes and HTTP status (`shared/api/errors.ts`): VALIDATION_ERROR 400,
BAD_REQUEST 400, AUTH_REQUIRED 401, INVALID_CREDENTIALS 401, SESSION_EXPIRED 401,
FORBIDDEN 403, ORIGIN_NOT_ALLOWED 403, INVALID_TOKEN 403, TOKEN_EXPIRED 403,
NOT_FOUND 404, METHOD_NOT_ALLOWED 405, CONFLICT 409, SLOT_TAKEN 409,
SLUG_TAKEN 409, IDEMPOTENCY_MISMATCH 409 (reserved, unused),
IDEMPOTENCY_IN_PROGRESS 409, BOOKING_NOT_CANCELLABLE 409,
BOOKING_NOT_RESCHEDULABLE 409, BOOKING_CANCELLED 410, SHOP_CLOSED 409,
OUTSIDE_BOOKING_WINDOW 409, STAFF_UNAVAILABLE 409, SERVICE_UNAVAILABLE 409,
TOO_MANY_OPEN_BOOKINGS 409, PAYLOAD_TOO_LARGE 413, UNSUPPORTED_MEDIA_TYPE 415,
IDEMPOTENCY_BODY_MISMATCH 422, ACCOUNT_LOCKED 423, RATE_LIMITED 429,
INTERNAL_ERROR 500, NOT_IMPLEMENTED 501, DATABASE_UNAVAILABLE 503.

### Built (prompts 1 and 2)

| Method    | Path                            | Auth                                                                     | Request                                                                                                               | Response and errors                                                                                                                                                                                                                                                                                       |
| --------- | ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET       | /api/health                     | public                                                                   | none                                                                                                                  | `healthResponseSchema` (200 ok, 503 degraded)                                                                                                                                                                                                                                                             |
| GET       | /api/shop                       | public                                                                   | none                                                                                                                  | `publicShopSchema`, cached 60s                                                                                                                                                                                                                                                                            |
| GET       | /api/services                   | public                                                                   | none                                                                                                                  | `{ services: PublicService[] }`, cached 60s                                                                                                                                                                                                                                                               |
| GET       | /api/staff                      | public                                                                   | none                                                                                                                  | `{ staff: PublicStaff[] }`, cached 60s                                                                                                                                                                                                                                                                    |
| GET       | /api/staff/:slug                | public                                                                   | slug or alias                                                                                                         | `{ staff, requestedSlug, canonical }`; 404 when deleted or hidden                                                                                                                                                                                                                                         |
| GET       | /api/availability               | public                                                                   | query `date`, `serviceIds` (comma list), `staff` (any, slug, alias or id)                                             | `availabilityResponseSchema`: slots, `reason`, `closedReason`; cached 10s; 404 unknown staff; SERVICE_UNAVAILABLE                                                                                                                                                                                         |
| GET       | /api/availability/days          | public                                                                   | query `serviceIds`, `staff`, optional `from`, `to` (default: today to the end of the booking window, at most 62 days) | `availabilityDaysResponseSchema`: `days[{date, available, reason}]` and `availableDates`; cached 30s                                                                                                                                                                                                      |
| POST      | /api/bookings                   | public, rate limited, `Idempotency-Key` header required (8 to 128 chars) | `createBookingRequestSchema` (`website` is a honeypot)                                                                | 201 `createBookingResponseSchema` plus `Idempotent-Replayed` header; 400 missing key or honeypot; SLOT_TAKEN with alternatives, SHOP_CLOSED, OUTSIDE_BOOKING_WINDOW, STAFF_UNAVAILABLE, SERVICE_UNAVAILABLE, TOO_MANY_OPEN_BOOKINGS, IDEMPOTENCY_IN_PROGRESS, IDEMPOTENCY_BODY_MISMATCH 422, RATE_LIMITED |
| GET       | /api/bookings/manage            | public (signed token), rate limited                                      | query `token`                                                                                                         | `manageBookingResponseSchema`; INVALID_TOKEN, TOKEN_EXPIRED, NOT_FOUND, BOOKING_CANCELLED                                                                                                                                                                                                                 |
| POST      | /api/bookings/manage/cancel     | public (signed token), rate limited                                      | `cancelBookingRequestSchema`                                                                                          | `manageBookingResponseSchema`; BOOKING_NOT_CANCELLABLE, BOOKING_CANCELLED                                                                                                                                                                                                                                 |
| POST      | /api/bookings/manage/reschedule | public (signed token), rate limited                                      | `rescheduleBookingRequestSchema`                                                                                      | `rescheduleBookingResponseSchema` (new manage path); BOOKING_NOT_RESCHEDULABLE, SLOT_TAKEN with alternatives, BAD_REQUEST when nothing changes                                                                                                                                                            |
| GET, POST | /api/internal/outbox/deliver    | internal                                                                 | none                                                                                                                  | `{ sent, failed, remaining }`                                                                                                                                                                                                                                                                             |

Rate limits (`server/services/bookingService.ts`, `DEFAULT_LIMITS`): POST
/api/bookings 10 per IP per 10 minutes and 5 per phone per day (counted even when
the booking is refused); manage endpoints 30 per IP per 10 minutes.

Idempotency: the key is scoped to the route; the body hash excludes the honeypot
field. A replay returns the stored status and body with `Idempotent-Replayed:
true`. A failed attempt releases the key so the client may retry with it.

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

The availability engine (`server/services/availability.ts`) answers: for a date
range, a list of services and a chair (or "any"), which start times are bookable.
It is pure: `loadAvailabilityContext` (`availabilityData.ts`) loads everything
with one query per collection (seven in total for any range) and the engine
never touches I/O, so it is unit tested with explicit clocks, including both DST
transitions.

Inputs: booking settings, the chosen services, every staff record, shop and
staff weekly hours, closures, time blocks, confirmed bookings overlapping the
range, `now`, and optionally a booking id to ignore (reschedule).

Algorithm, per shop-local day

1. Window: a date before today or after `today + bookingWindowDays` is
   `outsideWindow`.
2. Qualification: a chair counts only when it is not deleted, shown on the
   website, accepts online booking and performs every chosen service. Nobody
   left is `noQualifiedStaff`. A specific selector resolves by current slug,
   former slug or id.
3. Shop hours: the closure for the date (`closed` or `specialHours`) else the
   weekly hours; none is `closed`.
4. Per chair: weekly hours plus `extraHours` blocks, intersected with shop hours,
   minus `timeOff` and `dayOff` blocks. Nothing left is `dayOff` for that chair;
   if every chair is off, the day is `dayOff`.
5. Busy: confirmed bookings (each with its own captured buffer) and `block` time
   blocks.
6. Total = sum of service durations + effective buffer, where the effective
   buffer is the largest of each service's override or the shop default. Starts
   step by `slotStepMinutes` from each working range start (rounded up to the
   grid); a start is kept only when start + total ends inside the range and
   overlaps nothing busy. So the buffer must fit before closing time too.
7. Lead time: starts earlier than `now + leadTimeMinutes` are dropped. When that
   alone empties a day it reads `outsideWindow`; otherwise an empty day is
   `fullyBooked`.
8. First available: free chairs for one start are ranked by
   `firstAvailableStrategy`: `leastBookedThatDay` (fewest confirmed minutes that
   day, then display order, then id) or `roundRobin` (rotating by slot index).
   Each slot carries the pick and every candidate, best first. The booking
   service uses that order for fallback when the pick's lock insert conflicts.

Settings (`shopSettings.booking`, owner-editable)

| Setting                 | Default            | Meaning                                                                                      |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| slotStepMinutes         | 15                 | start-time granularity; multiple of 15                                                       |
| bufferMinutes           | 10                 | cleanup gap locked after every booking; a service may override with `services.bufferMinutes` |
| leadTimeMinutes         | 60                 | earliest online start relative to now                                                        |
| bookingWindowDays       | 30                 | how far ahead customers may book                                                             |
| cancelCutoffMinutes     | 120                | customers cannot cancel online closer than this                                              |
| rescheduleCutoffMinutes | 120                | same for reschedule                                                                          |
| maxServicesPerBooking   | 3                  |                                                                                              |
| allowFirstAvailable     | true               | show the "first available" option                                                            |
| firstAvailableStrategy  | leastBookedThatDay | or roundRobin                                                                                |
| requireEmail            | false              | email optional at checkout                                                                   |
| maxOpenBookingsPerPhone | 3                  | confirmed future bookings a phone may hold                                                   |

Owner and barber bookings (walk-ins, manual entries, prompt 3) bypass lead time,
booking window and the per-phone cap, but never bypass locks.

## 7. Customer manage link

Format `v1.<payload>.<signature>` where `payload` is base64url of
`{ "b": bookingId, "v": manageTokenVersion, "exp": unixSeconds }` and `signature`
is base64url of HMAC-SHA256 over `"v1." + payload` with `MANAGE_LINK_SECRET`.

- Issued in the confirmation email and on the success screen as
  `APP_BASE_URL/manage?token=...`. The token only ever travels in the query
  string of that page and in POST bodies.
- Expiry: booking `endAt` plus 7 days.
- Resolution order (`resolveManageToken`): signature and expiry first (no
  database work for junk), then the booking must exist, then a cancelled
  booking answers BOOKING_CANCELLED (410), then the token version must equal the
  booking's current `manageTokenVersion` else INVALID_TOKEN (the link was
  replaced by a reschedule).
- Allows: view the booking; cancel if `now <= startAt - cancelCutoffMinutes`;
  reschedule under the same rule with `rescheduleCutoffMinutes`, optionally to
  another chair or "any". Nothing else.
- Cancel and reschedule bump the version inside their transaction, so every
  earlier link stops working and the new confirmation carries a fresh link.
- Rotating `MANAGE_LINK_SECRET` invalidates every outstanding link.

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
   rows (`enqueueBookingNotifications`): the customer message when they gave an
   email, and the owner alert. Dedupe keys are
   `booking:<id>:<event>:v<sequence>:<customer|owner>`, so each reschedule gets
   exactly one message and a retried transaction never doubles up. Booking and
   notification commit together or not at all.
2. Delivery (`server/notifications/deliver.ts`) claims one row at a time by
   flipping it to `sending` with an atomic update, renders the template, calls
   the channel, then marks it sent or failed. Retryable failures back off
   exponentially (2, 4, 8 ... minutes, capped at 60) up to `maxAttempts` (5),
   then park as `failed`; non-retryable failures (rejected address, bad
   payload) park at once. A row stuck in `sending` for 10 minutes is reclaimed.
   Sending is idempotent per row: a claimed or sent row is never sent twice, and
   the row id is passed to the provider as its idempotency key.
3. Triggers: right after a booking request commits, the route schedules
   `deliverOutboxIds` through `waitUntil` from `@vercel/functions`, so the
   response is not delayed (`OUTBOX_AFTER_RESPONSE=off` turns this off for
   tests); Vercel Cron calls `GET /api/internal/outbox/deliver` once a day
   (`vercel.json`) as a backstop; the owner dashboard will expose retry.

Channel interface (`server/notifications/channel.ts`)

```ts
interface NotificationChannel {
  readonly channel: 'email' | 'sms';
  send(
    message: RenderedMessage,
  ): Promise<{ ok: true; providerId: string } | { ok: false; error: string; retryable: boolean }>;
}
```

Implementations: `LogEmailChannel` (development and tests) and
`ResendEmailChannel` (production, chosen by `EMAIL_PROVIDER=resend`). The
registry (`registry.ts`) builds the channel from the environment and lets tests
swap one in. An SMS channel registers the same way later.

Templates (`server/notifications/templates`): bookingConfirmed,
bookingRescheduled, bookingCancelled, ownerNewBooking, ownerBookingCancelled,
ownerBookingRescheduled. Each renders plain text and simple HTML from a
self-contained payload (booking view plus a shop snapshot) and attaches an
`.ics` built by `shared/lib/ics.ts`: stable UID `booking-<id>@<host>`, SEQUENCE
equal to the booking's version, METHOD:REQUEST for confirmations and
reschedules, METHOD:CANCEL for cancellations, and a VTIMEZONE block for
America/New_York. The success screen offers the same file from the browser.

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
