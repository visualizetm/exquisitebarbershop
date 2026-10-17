REPORT 03: ADMIN
Summary: Staff can now sign in and run the shop. Owner and barber logins use argon2id passwords, opaque `__Host-` session cookies with 14-day sliding and 60-day absolute expiry, per-IP and per-email throttling with a growing lockout, and an audit entry for every attempt. Sixty-three routes each declare a role, the router refuses to start without one, and the service layer checks scope again, so another chair's records read as not found. The owner API covers today, schedule, bookings with undoable status changes, phone and walk-in bookings, time blocks, who's in, customers, catalog, hours, closures, settings, logins, audit and outbox; any change that would strand future bookings returns 409 with each affected booking until the owner keeps or cancels it. A functional, unstyled dashboard ships as a lazy chunk; 279 Vitest tests and 6 Playwright flows pass.
Built:

- First change: server/services/availability.ts lets the cleanup buffer after the last booking run past closing (services must still end by close, the buffer may never overlap a booking or block); tests/unit/availability.test.ts; branches stay 100 percent (177 of 177)
- Auth: server/auth/{password,cookies,sessions,authService}.ts, server/http/routes/auth.ts, server/http/router.ts (known-level check, default deny), server/http/{context,delivery}.ts, scripts/user-reset.ts (`npm run user:reset`), scripts/seed.ts and server/services/seedService.ts (owner from SEED_OWNER_PASSWORD, weak passwords refused)
- Owner and barber API: server/http/routes/{admin,me}.ts; server/services/{access,adminBookings,adminSchedule,adminCatalog,scheduleChanges,scheduleData,locks,views}.ts; server/services/bookingService.ts (manual bookings, owner reschedule and cancel cores, idempotency), bookingNotifications.ts (audience), bookingView.ts
- Data: shared/schemas/{loginThrottle,scheduleGuard}.ts, additive fields in user.ts, booking.ts, shopSettings.ts; shared/api/{auth,admin}.ts, shared/api/errors.ts (3 codes, `affected`); server/repos/{loginThrottleRepo,scheduleGuardsRepo}.ts and additions to users, sessions, bookings, slotLocks, timeBlocks, closures, audit, outbox repos; server/db/indexes.ts
- Dashboard: src/admin/ (AdminApp, session, useSession, useConflictAction, usePagedList, format; components ConflictResolver, BookingList, BlockTimeForm, TimeBlockItem, WeekHoursEditor, AdminNav, ErrorNote; pages Login, ChangePassword, Account, Today, Schedule, Bookings, BookingDetail, NewBooking, BlockTime, WhosIn, Customers, MySchedule, Audit, Outbox, settings/{Services,Staff,Hours,Closures,Shop,Logins}); src/app/App.tsx (React.lazy), src/lib/api.ts (`affected`); src/pages/AdminPage.tsx removed
- Tests: tests/integration/{authz,auth,idor,conflicts,manualBookings,adminApi}.test.ts, tests/unit/password.test.ts, tests/helpers/auth.ts, tests/e2e/admin.spec.ts, scripts/e2e-server.ts and scripts/e2e-accounts.ts (seeded owner and barber)
- Docs: docs/ARCHITECTURE.md (sections 2, 3, 5, 6, 8, 11, 12), .env.example
  Key decisions:
- argon2id at the OWASP baseline (19 MiB, t=2, p=1), about 75 ms; rejected 64 MiB t=3 (report 01 sketch) as too slow for a cold serverless function. needsRehash upgrades hashes at login if the costs change.
- Sliding renewal at most once an hour, not on every request, to avoid a write per request.
- Lockout is keyed by sha256 of the email in its own `loginThrottle` collection, for unknown emails too, so lockout itself never reveals whether an account exists; rejected the users.failedLoginCount fields for that reason.
- `scheduleGuards`: every booking write and schedule change on a chair bumps one guard document in its transaction, so the conflict check and a concurrent booking can never both commit. Without it the race test stranded a booking 6 of 6 runs; with it, 0.
- Conflict rule as one transaction (snapshot, apply, re-check, abort when unresolved); bookings that were already outside working time are not raised again. Barbers may only keep.
- Status undo is a transition back to confirmed; restoring a cancelled booking re-takes its locks and fails with SLOT_TAKEN if the time is gone, never overlapping.
- Owner phone override relaxes only lead time and the booking window; it never touches locks, and it is audited.
- Completed and no-show bookings keep their slot locks and now also count as busy in availability (found by e2e: /book offered a time that then failed with SLOT_TAKEN).
- The admin area is one lazy chunk; the owner and barber share it, and the server decides what each may see.
  Deviations:
- Safer choices on hard-to-reverse points: lockout by email hash for unknown emails; walk-ins still require a customer phone (the schema is additive only, phone stays required); "deactivating" a service means soft delete (isActive false only hides it from new bookings and is not treated as removal); barbers keep-only on conflicts; a new scheduleGuards collection rather than reusing slotLocks.
- A lead-time rejection now answers OUTSIDE_BOOKING_WINDOW (it said SLOT_TAKEN), a code that already existed for that case.
- users.failedLoginCount and lockedUntil stay in the schema (additive only) but are no longer written; usersRepo.recordFailedLogin was removed.
- Route shapes differ from the prompt 3 sketch in ARCHITECTURE section 5 (written in prompt 1); the section now lists the real 63 routes.
- The old booking e2e booked the first open day, which fails whenever today still has times inside the 120-minute reschedule cutoff; it now books the second open day.
  Data model:
- shopSettings: + permissions.barbersCanBlockTime (default false); index _id
- staff: unchanged; uniq_slugKeys (unique multikey), public_listing
- services: unchanged; public_listing
- weeklyHours: unchanged; uniq_subject (unique)
- closures: unchanged; uniq_date (unique)
- timeBlocks: unchanged; staff_range, by_start
- bookings: + source "phone", + ownerSeenAt (optional); uniq_referenceCode, staff_start, start_status, customer_phone, + unseen_new (status, source, ownerSeenAt, startAt)
- slotLocks: unchanged; uniq_staff_slot (unique, staffId + slotStart), by_holder
- users: + mustChangePassword; uniq_email (unique), by_staff (unique, partial)
- sessions: unchanged; uniq_tokenHash (unique), ttl_expiresAt, by_user
- loginThrottle (new): _id = sha256 of the email; ttl_expiresAt (24 h after the last failure)
- scheduleGuards (new): _id = staffId, version; _id only
- auditLog, emailOutbox, idempotencyKeys, rateLimits: unchanged schemas and indexes
  API contract:
- Public (12): health, shop, services, staff, staff/:slug, availability, availability/days, POST bookings, bookings/manage (GET, cancel, reschedule), POST /api/auth/login
- Barber or owner (9): POST /api/auth/logout, /logout-all, GET /api/auth/me, POST /api/me/password (these four allowed with a temporary password); GET /api/me/schedule, GET /api/me/bookings/:id, POST /api/me/bookings/:id/status, POST /api/me/time-blocks, DELETE /api/me/time-blocks/:id
- Owner (40): /api/admin/ today, schedule, whos-in; bookings GET and POST (Idempotency-Key), bookings/:id GET and PATCH, /status, /cancel, /reschedule; customers; time-blocks GET, POST, DELETE /:id; staff/:id/day; services GET, POST, PATCH, DELETE; staff GET, POST, PATCH, DELETE, /:id/slug, /:id/hours; hours GET, PUT; closures GET, PUT, DELETE /:id; settings GET, PUT; users GET, POST, /:id/reset-password, /:id/disable, /:id/enable; audit; outbox GET, /:id/retry
- Internal (2): GET and POST /api/internal/outbox/deliver (CRON_SECRET)
- New errors: PASSWORD_CHANGE_REQUIRED 403, SCHEDULE_CONFLICT 409 (with affected), INVALID_TRANSITION 409
  Tests:
- Vitest: 279 passed, 0 failed across 39 files (101 unit, 178 integration). Playwright: 6 passed, 0 failed (4 new admin flows, 2 booking flows).
- Authorization matrix: 63 routes x 4 roles (logged out, barber, owner, login with a temporary password) = 252 checks, every registered route covered and asserted once; the route list must equal the expected map, so a new route without a declared level fails it, and createRouter throws on an unknown level.
- IDOR (10): another barber's booking, status, time block and schedule read as 404 like made-up ids; smuggled staffId ignored; owner routes 403 for barbers; a manage token sent as a bearer header, as the session cookie, as another cookie, in the query or in the body gets 401 from admin and barber routes.
- Sessions and login (16 + 6 unit): hardened cookie, same status, body and timing for wrong password and unknown email, audit without passwords, growing lockout, IP and account limits, forced change, idle expiry, sliding, 60-day limit, logout and logout everywhere, password change, tampered cookies, disabled login.
- Conflict rule (16): hours, chair hours, closures, special hours, time off, blocks, day off and back in, extra hours, staff removal, service removal, service dropped from a chair, partial answers refused, unrelated choices ignored, guard bump, and the race test.
- Manual bookings (10): override refused then allowed and audited, never over a held slot, idempotent replay, walk-ins now or later today, locks taken, email skipped by default, outside-hours flag, owner reschedule with override and notify.
- Admin API (16): transitions and undo, restore over a taken slot, barber complete and no show, today counts and revenue, schedule, who's in, list filters, search, cursor, new flag, notes, customers, service CRUD, slug alias, settings permission, logins lifecycle, audit paging, outbox retry, completed bookings stay busy.
- Coverage (lines / branches / functions): seed 100 / 100 / 100; server/auth 98.0 / 90.6 / 100; server/db 96.4 / 75.9 / 100; server/http 96.2 / 83.7 / 100; server/http/routes 99.1 / 93.3 / 100; server/lib 93.4 / 85.1 / 96.0; server/notifications 97.2 / 93.3 / 100; server/repos 98.6 / 90.4 / 100; server/services 98.1 / 90.1 / 98.1; shared/api 99.0 / 93.8 / 90.0; shared/lib 98.3 / 94.8 / 95.3; shared/schemas 90.3 / 72.2 / 63.6; total 97.7 / 89.7 / 97.5; availability.ts 100 percent branches. src is covered by the e2e flows only.
- Commands: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:coverage`, `npm run test:e2e`, `npm run build` (with MONGOMS_SYSTEM_BINARY set locally because the MongoDB download host is blocked here).
  Checks:
- typecheck: pass. lint: pass, 0 warnings. format:check: pass.
- build: pass. Public bundle dist/assets/index-\*.js 479.8 kB (147.4 kB gzip); admin chunk dist/assets/AdminApp-\*.js 92.0 kB (22.1 kB gzip), loaded only under /admin.
  Commits:
- 06daac5 feat(availability): let the cleanup buffer run past closing time
- e8cf925 feat(data): additive schemas and repositories for auth and admin
- 7a5dfda feat(admin): sessions, login throttling, owner and barber APIs
- 0553af6 test(admin): authorization matrix, IDOR, sessions, conflicts and manual bookings
- 9c33574 test(admin): owner and barber API coverage
- 625e81e style: format bookingService
- 7301b19 feat(admin): functional staff dashboard as a lazy-loaded chunk
- 161bd23 fix(availability): completed and no-show bookings keep their time
- 2fc1cdc test(e2e): owner, barber and logged-out dashboard flows
- a0cf223 test(e2e): validate the barber schedule with the shared schema
- 4430d4b docs: auth, sessions, conflict rule and the prompt 3 route table
- 56ddab3 fix(admin): booking search matches phone digits that look like a code
- e87bb24 test(auth): compare login timing by median over five samples
- plus the commit adding this report
  Env vars:
- MONGODB_URI, MONGODB_DB_NAME, APP_BASE_URL, MANAGE_LINK_SECRET: needed now (unchanged)
- SEED_OWNER_PASSWORD: needed now, at seed time only, to create the owner login; 12+ characters, weak ones refused; remove after seeding
- SEED_OWNER_EMAIL: optional, overrides the placeholder owner email in seed/shop.ts
- CRON_SECRET, EMAIL_PROVIDER, RESEND_API_KEY, EMAIL_FROM: needed for production email (unchanged)
- LOG_LEVEL, OUTBOX_AFTER_RESPONSE, MONGOMS_SYSTEM_BINARY: optional (unchanged)
  Open questions:
- The owner's real login email (placeholder owner@exquisitebarberbeauty.com) and each barber's email for their logins.
- Should barbers block their own time? It ships off; the owner can turn it on in Settings.
- Should a chair that does not take online bookings still take phone bookings? Today phone bookings follow online rules, so only walk-ins reach such a chair.
- When a cut finishes early, should the rest of its slot reopen? Today completed bookings keep their time.
  Known gaps and risks:
- Anyone who knows the owner's email can keep that email locked (up to 4 hours per lockout) by failing logins; `npm run user:reset` clears it. A second factor or an unlock email would remove the risk.
- Safari may not keep a Secure cookie on http://localhost, so local development of the dashboard should use Chromium or Firefox. Production is HTTPS on Vercel.
- Playwright's request API does not send the Secure cookie over http, so the e2e checks API access from inside the page.
- The dashboard is unstyled and only the flows above run end to end; component tests can come with the design pass.
- Walk-ins skip online-only checks and may be outside working time (flagged in the response and the audit); the owner sees them on the schedule.
- users.failedLoginCount and lockedUntil are dead fields kept for the additive-only rule.
  Ready for next step:
- Start with the design pass on public pages and the dashboard (`exq-*` and `exq-adm-*` classes, data-state) or with gift cards, rewards or SMS, which slot in as new outbox channels, booking subdocuments and feature flags.
- Must not change: everything listed in reports 01 and 02; the session cookie name and attributes; the 63 route paths and their auth levels; the authz matrix test (add each new route to it); the conflict rule contract (409 SCHEDULE_CONFLICT with affected, resolutions keep, cancel, cancelAndNotify); the scheduleGuards bump in every booking and schedule write; slot locks kept by completed and no-show bookings; the error codes added here; exq-adm- class names and data-state values.
