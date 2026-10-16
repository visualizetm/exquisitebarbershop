REPORT 02: BOOKING
Summary: The public booking system is complete end to end. A pure availability engine computes open times per chair per day in America/New_York from settings, hours, closures, time blocks and bookings, loaded with one query per collection. A booking service creates, cancels and reschedules inside single transactions with slot locks, first-available fallback across chairs, idempotency keys, rate limits, a honeypot and the per-phone cap, and answers conflicts with the next open times. Emails go through an outbox with log and Resend transports, six templates with text, HTML and .ics attachments, delivery right after the response through waitUntil, exponential backoff and a daily cron backstop. The Book and Manage pages are functional and unstyled with URL step state, card-link preselection, inline conflict recovery, accessible focus handling and a success screen with reference code, manage link and .ics download. 198 Vitest tests and 2 Playwright flows pass; availability.ts has 100 percent branch coverage.
Built:

- Availability: server/services/availability.ts (engine), server/services/availabilityData.ts (loader), server/http/routes/availability.ts; shared/api/availability.ts (reasons, selector, days range)
- Booking: server/services/bookingService.ts, server/services/bookingNotifications.ts, server/services/bookingView.ts, server/http/routes/bookings.ts, server/http/routes/internal.ts; shared/api/bookings.ts; router cron auth in server/http/router.ts; SLOT_TAKEN alternatives via AppError.extra in server/lib/errors.ts and server/http/respond.ts; server/lib/objects.ts (stableStringify)
- Notifications: server/notifications/{channel,registry,payload,deliver}.ts, server/notifications/email/{logChannel,resendChannel}.ts, server/notifications/templates/index.ts, server/lib/afterResponse.ts; shared/lib/ics.ts; server/repos/emailOutboxRepo.ts (claim by id, stale reclaim, non-retryable failures, dedupe pre-check); server/repos/weeklyHoursRepo.ts (listAllHours)
- Schemas: shared/schemas/service.ts (bufferMinutes override), shared/schemas/shopSettings.ts (buffer default 10), shared/api/errors.ts (BOOKING_CANCELLED 410, IDEMPOTENCY_BODY_MISMATCH 422, alternatives); seed/shop.ts (buffer 10, braids override 20)
- Web: src/pages/BookPage.tsx, src/pages/ManagePage.tsx, src/components/booking/{ServicePicker,StaffPicker,DayPicker,TimePicker,CustomerForm,BookingSummary,IcsDownload,StepHeading}.tsx, src/lib/booking/{state,helpers}.ts, src/lib/api.ts (fresh fetch, alternatives), src/lib/useApi.ts (version)
- Tests: tests/unit/{availability,ics,templates}.test.ts (+ time.test.ts), tests/integration/{bookings,availabilityRoutes,outbox}.test.ts, tests/helpers/{availabilityFixtures,bookingApi}.ts, tests/e2e/booking.spec.ts, playwright.config.ts, scripts/e2e-server.ts
- Ops: vercel.json (daily cron), .env.example, docs/ARCHITECTURE.md sections 4 to 9 and 11, package.json (test:e2e, e2e:server), .gitignore and .prettierignore (Playwright output)
  Key decisions:
- One transaction per candidate chair for "first available". A duplicate key inside a MongoDB transaction aborts it server-side (verified empirically), so retrying inside one transaction is impossible; the loop tries the next chair in a fresh transaction within the same request.
- The buffer must fit before closing time (start + services + buffer inside the working range), as the prompt states. The alternative (letting the buffer spill past close) would offer one more slot per day; it is a one-line change in computeStaffDay if the client prefers it.
- Effective buffer is the largest of each chosen service's override or the shop default, so a long-cleanup service wins in a multi-service booking.
- Lead time exhaustion reads outsideWindow (the window has a start and an end), fully booked days read fullyBooked; the five reasons from the prompt are the complete set.
- IDEMPOTENCY_BODY_MISMATCH 422 was added instead of changing IDEMPOTENCY_MISMATCH 409, which stays reserved, so the prompt 1 contract is untouched.
- Rate limits count refused attempts too, so a bot cannot probe freely; limits are configurable per call for tests and later for the admin.
- Vercel Cron calls with GET, so the internal delivery route accepts GET and POST behind the CRON_SECRET bearer check, which runs before routing like the Origin check.
- Customer details stay in sessionStorage, never in the URL; steps, services, chair, day and time live in the URL so back and refresh work.
- Playwright pinned to 1.56.1 to match the preinstalled Chromium build; the e2e server boots an in-memory replica set, seeds it and starts the API and Vite.
  Deviations:
- The push to GitHub is still refused with 403 (same as report 01); all 9 new commits are local on claude/practical-maxwell-t6zzzk.
- GET /api/availability/days takes an optional from and to range (default: the whole booking window, capped at 62 days) instead of the month parameter sketched in report 01.
- Cache headers are max-age 10 for slots and 30 for days; the browser bypasses its cache after a conflict.
  Data model:
- services: added bufferMinutes (int or null); no index changes
- emailOutbox: unchanged schema; claim query now also reclaims sending rows older than 10 minutes
- All other collections and every index unchanged from report 01
  API contract:
- GET /api/availability (public), GET /api/availability/days (public)
- POST /api/bookings (public, Idempotency-Key required, rate limited, honeypot)
- GET /api/bookings/manage, POST /api/bookings/manage/cancel, POST /api/bookings/manage/reschedule (public, signed token, rate limited)
- GET and POST /api/internal/outbox/deliver (internal, CRON_SECRET bearer)
- Unchanged: GET /api/health, /api/shop, /api/services, /api/staff, /api/staff/:slug (public). Prompt 3 routes unchanged in docs/ARCHITECTURE.md section 5.
  Tests:
- Vitest: 198 passed, 0 failed across 32 files (92 unit, 106 integration). Playwright: 2 passed, 0 failed.
- Race test: 25 parallel POST /api/bookings for one chair and slot (distinct IPs and phones): exactly 1 returned 201, 24 returned 409 SLOT_TAKEN, 3 locks exist and all point at the winning booking, no lock references a missing booking, no idempotency key left in progress.
- availability.ts: 100 percent lines, 100 percent branches (150 of 150), 100 percent functions.
- Coverage (lines / branches / functions): seed 100 / 100 / 100; server/db 96.3 / 75.9 / 100; server/env.ts 79.1 / 72.7 / 75.0; server/http 97.0 / 81.5 / 100; server/lib 93.4 / 85.1 / 96.0; server/notifications 97.8 / 91.2 / 100; server/repos 98.9 / 92.6 / 100; server/services 98.4 / 93.9 / 100; shared 96.1 / 92.2 / 90.6; total 97.5 / 89.8 / 97.5. src is still outside Vitest coverage; the e2e flows cover it.
- Commands: npm run typecheck; npm run lint; npm run format:check; npm run test:coverage; npm run build; npm run test:e2e. Tests ran with MONGOMS_SYSTEM_BINARY pointing at the conda-forge mongod 8.0.23 because the MongoDB download host is blocked in this sandbox.
  Checks:
- typecheck: pass; lint: pass with zero warnings; format:check: pass
- build: pass, dist/assets/index-*.js 472.2 kB (145.1 kB gzip)
- test:e2e: 2 passed in about 9 seconds against the e2e server
  Commits:
- 0ed9a0b chore: add @vercel/functions and Playwright with an e2e server script
- 6b57189 feat(shared): per-service buffer, availability reasons, booking payloads and ics builder
- cb19a2c feat(server): pure availability engine with one query per collection
- e4fcf92 feat(server): notification channels, email templates, ics attachments and outbox delivery
- a3f11f1 feat(server): booking service with manage link flows and public booking routes
- 422076e feat(web): booking flow and manage page
- ee96116 test: availability, booking, manage, outbox, ics and template suites plus Playwright e2e
- 60d74b0 chore: cron backstop for the outbox, env documentation and architecture update
- 27bdcb6 docs: booking report
  Env vars:
- MONGODB_URI, MONGODB_DB_NAME, APP_BASE_URL, MANAGE_LINK_SECRET (now): unchanged
- CRON_SECRET (now): bearer token Vercel Cron sends to the outbox delivery route
- EMAIL_PROVIDER (production): log by default, resend in production; RESEND_API_KEY and EMAIL_FROM (production): required with resend
- OUTBOX_AFTER_RESPONSE (tests only): off lets tests drive delivery by hand
- SEED_OWNER_PASSWORD (later, prompt 3); LOG_LEVEL, MONGOMS_SYSTEM_BINARY (optional); VERCEL_* set by Vercel
  Open questions:
- GitHub push access: reconnect GitHub or install the Claude GitHub App on the repository so the branch can be pushed.
- Should the cleanup buffer be allowed to run past closing time so the last slot of the day stays bookable?
- Resend account and sending domain (EMAIL_FROM) for production, and the real owner alert address.
- Vercel plan: Hobby runs the cron once a day, so a message that failed its first attempt may wait up to a day; Pro allows a more frequent backstop.
- Confirm the placeholder braids buffer (20 minutes) and which other services need longer cleanup.
  Known gaps and risks:
- No UI unit tests; the booking pages are covered only by the two Playwright flows.
- The Resend transport is tested against a fake fetch, not the live API.
- Availability is recomputed inside each booking transaction with seven queries; fine for one shop, worth a cache if traffic grows.
- The 10 second browser cache on slots can show a stale time for up to 10 seconds; the server rejects it and offers alternatives, so correctness holds.
- src bundle grew to 145 kB gzipped (Luxon, zod, React Router); code splitting is still deferred to after the design pass.
- Owner and barber manual bookings, walk-in blocks and the admin outbox retry are designed but not built (prompt 3).
  Ready for next step:
- Prompt 3 should start with auth (argon2id, sessions, cookie authenticator replacing denyAllAuthenticator in server/http/app.ts), then the owner and barber routes listed in docs/ARCHITECTURE.md section 5, reusing bookingService for manual bookings and cancellations with source owner, walkIn or barber, and timeBlocksRepo with slotLocksRepo for walk-in blocks.
- Must not change: everything from report 01, plus the availability engine's reasons and candidate order, the one-transaction-per-candidate fallback, outbox dedupe keys and claim semantics, the manage token resolution order, the error codes added here, and the exq-* class names and data-state values the pages expose.
