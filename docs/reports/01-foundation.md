REPORT 01: FOUNDATION
Summary: The repository now holds a strict TypeScript monorepo for the Exquisite Barber & Beauty Lounge site and booking system: a Vite + React + React Router app with every public route stubbed and three pages reading live API data, one Vercel catch-all function routing through a server layer with a shared error contract, a MongoDB data layer with a cached client, transactions, a single index registry and one repository per collection, and zod schemas in /shared for every document and API payload. Placeholder shop data seeds idempotently. 128 unit and integration tests run on a mongodb-memory-server replica set and prove the slot lock unique index rejects double bookings under concurrency and that transactions roll back cleanly. CLAUDE.md fixes the rules and docs/ARCHITECTURE.md designs the whole system, including prompts 2 and 3 and the deferred gift card, rewards and SMS work.
Built:

- Rules and docs: CLAUDE.md, docs/ARCHITECTURE.md, docs/reports/01-foundation.md
- Tooling: package.json (scripts, engines 22.x), .nvmrc, tsconfig.base/app/node.json, eslint.config.js (strict type-aware), .prettierrc.json, .editorconfig, .env.example, .gitignore, vite.config.ts (build sha define, /api proxy), vitest.config.ts (replica set global setup, coverage thresholds), vercel.json (SPA rewrite excluding /api, CSP and security headers), .github/workflows/ci.yml
- Shared: shared/lib/{constants,time,money,phone,slug,referenceCode}.ts; shared/schemas/* (14 document schemas plus input schemas); shared/api/{errors,health,public,availability,bookings}.ts
- Server data layer: server/env.ts, server/db/{client,transaction,indexes,collections}.ts, server/repos/* (14 repositories), server/lib/{errors,logger,ids,manageToken,objects}.ts
- Server HTTP: server/http/{router,request,respond,origin,types,app,dev-adapter}.ts, server/http/routes/{health,public}.ts, api/[...path].ts
- Seed and scripts: seed/shop.ts (every value marked PLACEHOLDER), server/services/seedService.ts, scripts/{indexes,seed,dev,dev-api}.ts
- Web: src/main.tsx, src/app/{App,Layout}.tsx, src/components/{SiteHeader,SiteFooter,Status}.tsx, src/lib/{api,useApi,usePageTitle}.ts, src/pages/* (Home, Services, Chairs, Chair, Gallery, Visit, Book, Manage, Admin, NotFound), src/styles/reset.css, index.html, public/robots.txt
- Tests: tests/helpers/{global-setup,db,fixtures}.ts, tests/unit/* (8 files), tests/integration/* (18 files)
  Key decisions:
- One catch-all serverless function with an in-process router instead of one file per route. Rejected per-route files: Vercel Hobby caps functions at 12, and one function keeps a single warm connection pool. Handlers stay thin; routes live in server/http/routes.
- String ids (ObjectId hex) for every document instead of native ObjectId. Rejected ObjectId: it would force a conversion layer and keep mongodb out of /shared schemas; string ids are identical in DB, API and client.
- Slug uniqueness enforced by a derived slugKeys array with a unique multikey index. Rejected checking in code: a code check cannot stop two owners racing, and the index also protects aliases against being reclaimed by another person.
- Locks cover duration plus buffer and the grid is a fixed 15 minutes. Rejected a configurable grid: changing it would misalign existing locks.
- Daily in/out toggles are timeBlocks (dayOff, extraHours) rather than flags on staff, so history is kept.
- Zod 4, mongodb 6, Vite 7, Vitest 3, ESLint 9, React Router 7, TypeScript 5.9. Newer majors exist (Vite 8, Vitest 5, ESLint 10, TypeScript 7) but their breaking changes are not yet well known; the chosen majors are current and supported.
- Raw ZodError reaching the responder maps to 500, not 400: only explicit request parsing produces VALIDATION_ERROR, so a server-built document failing its own schema is reported as a bug.
- The router denies every non-public route by default until the auth prompt supplies an authenticator.
  Deviations:
- Path aliases are defined once and used by Vite, Vitest and the web app, but /api and /server use relative imports. Reason: the Vercel Node runtime does not reliably resolve tsconfig paths at runtime; relative imports remove that risk.
- @vercel/node was not added. Handlers are typed on Node's IncomingMessage and ServerResponse, which the Vercel runtime passes, and the same handler runs under the local dev server and in tests.
- Node pinned to 22.x (the version available in this environment and on Vercel), not 24.x, so every check here ran on the pinned version.
- Admin dashboard, booking flow and manage page are route stubs only, as the prompt scoped.
  Data model:
- shopSettings: singleton _id "shop"; no extra indexes
- staff: uniq_slugKeys (slugKeys, unique multikey); public_listing (deletedAt, showOnWebsite, sortOrder)
- services: public_listing (deletedAt, isActive, group, sortOrder)
- weeklyHours: uniq_subject (subjectType, staffId, unique)
- closures: uniq_date (date, unique)
- timeBlocks: staff_range (staffId, startAt, endAt); by_start (startAt)
- bookings: uniq_referenceCode (unique); staff_start (staffId, startAt); start_status (startAt, status); customer_phone (customer.phone, startAt desc)
- slotLocks: uniq_staff_slot (staffId, slotStart, unique); by_holder (holderId)
- users: uniq_email (unique); by_staff (staffId, unique partial on string)
- sessions: uniq_tokenHash (unique); ttl_expiresAt (TTL); by_user (userId)
- auditLog: entity_history (entityType, entityId, at desc); by_time (at desc)
- emailOutbox: delivery_queue (status, nextAttemptAt); uniq_dedupeKey (unique partial); by_booking (bookingId, createdAt desc)
- idempotencyKeys: uniq_scope_key (scope, key, unique); ttl_expiresAt (TTL)
- rateLimits: uniq_key_window (key, windowStart, unique); ttl_expiresAt (TTL)
  API contract:
- Built: GET /api/health (public), GET /api/shop (public), GET /api/services (public), GET /api/staff (public), GET /api/staff/:slug (public, resolves aliases with a canonical flag)
- Designed for prompt 2 (public): GET /api/availability, GET /api/availability/days, POST /api/bookings, GET /api/bookings/manage, POST /api/bookings/manage/cancel, POST /api/bookings/manage/reschedule; POST /api/internal/outbox/deliver (internal)
- Designed for prompt 3: POST /api/auth/login (public), POST /api/auth/logout, GET /api/auth/me, POST /api/auth/change-password (barber); GET /api/me/schedule, GET /api/me/bookings/:id, POST /api/me/bookings/:id/status (barber); owner routes under /api/admin for schedule, bookings (list, get, create, patch, cancel, reschedule), time-blocks, staff day-status, services, staff and slug rename, hours, closures, settings, users, audit, outbox. Full table with schemas and error codes in docs/ARCHITECTURE.md section 5.
  Tests:
- 128 passed, 0 failed across 26 files (49 unit, 79 integration)
- Coverage (lines / branches / functions): seed 100 / 100 / 100; server/db 96.3 / 75.9 / 100; server/env.ts 78.6 / 72.7 / 75.0; server/http 85.6 / 80.9 / 80.0; server/lib 92.9 / 85.4 / 91.3; server/repos 98.9 / 92.1 / 100; server/services 100 / 100 / 100; shared 95.3 / 90.2 / 86.7; total 95.8 / 87.7 / 92.8. src is not yet under coverage (no UI tests until the design pass).
- Commands: npm run typecheck; npm run lint; npm run format:check; npm run test; npm run test:coverage; npm run build. In this sandbox tests ran with MONGOMS_SYSTEM_BINARY pointing at a mongod 8.0.23 extracted from conda-forge because fastdl.mongodb.org is blocked by the proxy; CI and dev machines download the pinned 8.0.23 binary normally.
- Smoke test outside Vitest: npm run db:indexes and npm run db:seed twice against a real replica set (second run created nothing), dev API answered /api/health, /api/staff/dontrise and rejected a cross-site POST.
  Checks:
- typecheck: pass (tsconfig.app.json and tsconfig.node.json)
- lint: pass with zero warnings; format:check: pass
- build: pass, dist/assets/index-*.js 441.7 kB (137.0 kB gzip); commit sha verified inside the bundle
  Commits:
- 4689360 chore: scaffold tooling, conventions and deployment config
- 43eef66 feat(shared): zod schemas and helpers shared by client and server
- be4ef5f feat(server): cached Mongo client, transactions, index registry and repositories
- 2d32154 feat(server): HTTP router, one error format, health and public routes
- ce06d1c feat(seed): placeholder shop data with idempotent seed and index scripts
- c69b200 test: unit and integration suites on an in-memory replica set
- da0fe07 feat(web): router stubs, layout and API-backed public pages
- 99fb41f docs: system architecture, data model, API contract and future features
- 2c6ddc2 docs: foundation report
  Env vars:
- MONGODB_URI (now): replica set connection string
- MONGODB_DB_NAME (now): database per environment, default exquisite
- APP_BASE_URL (now): site origin for manage links and the Origin guard
- MANAGE_LINK_SECRET (now, 32+ chars): HMAC key for customer manage links
- EMAIL_PROVIDER (later): log or resend; RESEND_API_KEY, EMAIL_FROM (later): delivery
- SEED_OWNER_PASSWORD (later, prompt 3): initial owner login created by the seed
- CRON_SECRET (later): bearer token for the outbox delivery cron
- LOG_LEVEL (optional); MONGOMS_SYSTEM_BINARY (optional, tests only)
- VERCEL_GIT_COMMIT_SHA, VERCEL_ENV, VERCEL_URL: set by Vercel
  Open questions:
- Real hours for the shop and each chair, the real service menu with prices and durations, which chairs perform Beauty services, chair numbers, barber names and Instagram handles.
- Cleanup buffer between bookings, booking window, cancel and reschedule cutoffs (placeholders: 0 min, 30 days, 2 hours).
- Owner alert email, sending domain for confirmations, final domain name.
- Vercel plan: Hobby limits cron to once a day, which affects how quickly a failed email retries.
- Email provider choice: Resend is designed in; confirm before prompt 2 wires it.
  Known gaps and risks:
- Auth is deny-all; admin, barber and manage pages are stubs. Booking and availability services do not exist yet.
- No UI tests and no Playwright yet; src is excluded from coverage.
- Dev-only audit advisories remain in vitest 3 (mocker path traversal in dev server mode) and are not reachable in production builds.
- Client bundle is 137 kB gzipped because of Luxon and zod; consider code splitting after the design pass.
- CSP allows inline styles to leave the designer room; tighten with nonces if not needed.
- seed/shop.ts assigns Beauty services to Dontrise only, as a placeholder.
- Rotating MANAGE_LINK_SECRET invalidates every outstanding manage link at once.
  Ready for next step:
- Prompt 2 should start with server/services/availability.ts (pure, unit tested with DST cases) and server/services/bookingService.ts composing bookingsRepo, slotLocksRepo, auditLogRepo and emailOutboxRepo inside withTransaction, with idempotency via idempotencyKeysRepo and rate limits via rateLimitsRepo, then the routes listed above and the Book and Manage pages.
- Must not change: the slotLocks unique index and 15 minute grid, string ids, the error body shape and error codes, the shared schemas' field names (additive changes only), soft delete semantics, slugKeys maintenance in staffRepo, the one-function API layout, and the reporting format in CLAUDE.md.
