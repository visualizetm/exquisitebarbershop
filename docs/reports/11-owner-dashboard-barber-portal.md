REPORT 11: OWNER DASHBOARD, BARBER PIN PORTAL, DEMO NOTICE, ICONS AND SOCIAL LINKS
Summary: The owner now runs the shop from a real dashboard at /admin (Overview, Bookings, Schedule, Customers, Team, Website, Settings) with global search, quick actions, alerts and a decision resolver that can Keep, Move, Cancel or Cancel and notify. Barbers no longer sign in at /admin: they use one shared page, /team, where they tap a name and a 6 digit PIN, and they see only their own day. The demo build opens with a blocking "This is a demo" notice, the public site gained Untitled UI icons and footer social links, and the site keeps working words and a Call link when the API is down. The owner and barber guides are rewritten as step by step scenarios with screens and two short recordings.

Built:

- Kit and shell (M1): src/components/ui (Sidebar, StatTile, DataTable, SearchBox, PinPad, BarChart, Tabs, BottomTabs, IconButton), src/admin/shell, src/styles/dashboard.css, server search (server/services, GET /api/admin/search)
- Overview and Bookings (M2): src/admin/overview, src/admin/bookings, src/admin/panels (New booking, Walk-in, Block time, Barber out, Announcement), alerts repo
- Schedule, Customers, Team (M3): src/admin/schedule, src/admin/customers, src/admin/team, src/admin/panels/{AlertPanel,Resolver}.tsx, resolver Move in server/services
- Website and Settings (M4): src/admin/website (Hours, Announcement, Services, Home photo, Gallery), src/admin/settings, POST /api/me/email
- Barber portal (M5): src/team, src/styles/team.css, server/auth/{pin,teamAuth}.ts, server/repos/{staffPins,setupTokens,teamSessions}Repo.ts, server/services/teamPortal.ts, server/http/routes/team.ts, shared/api/team.ts, src/admin/team/AccessTab.tsx
- M6: src/components/site/DemoNotice.tsx, src/components/ui/SocialIcon.tsx, icons across the frame and pages, Footer crest and follow links, OutageNotice in src/components/site/SiteDown.tsx
- Docs: docs/OWNER-GUIDE.md (and .pdf), docs/BARBER-GUIDE.md, DESIGN-SYSTEM, ARCHITECTURE 8d, SITE-REPORT, PROGRESS, DECISIONS D11-1 to D11-43
- Captures: tests/e2e/p11-capture.ts; docs/screens/p11/{m1..m6,guide,recordings}

Key decisions (full list in docs/DECISIONS.md):

- Barbers use one shared /team link, not per person logins. Rejected: email and password at /admin, which a shared phone and a chair side workflow handle badly.
- "I'm out today" never cancels. It keeps every booking and alerts the owner, who decides per client. Rejected: auto cancel, which could email customers by mistake.
- PINs are argon2id of an HMAC keyed by MANAGE_LINK_SECRET; setup links are 32 random bytes, hashed, 72 hours, single use. Rejected: reversible storage, so the owner never sees a PIN.
- One failure answer for every bad PIN case, with a lock after 5 tries (15 minutes) and a per address limit. Rejected: telling a caller which barbers exist.
- Barbers see names, services, times and notes, never phone or email.
- SocialIcon is the one icon not from Untitled UI (no brand glyphs there), logged as D11-37.
- Public pages degrade with an inline notice when the API is down; only /book and /manage show the full down screen (D11-39).
- Demo notice only when /api/shop says demo, once per session, and shown every time if storage is blocked.

Deviations:

- The branch is based on claude/p10-shop-sign-redesign plus a merge of brand/v2-final, because PR 5 and PR 6 are not merged. Merge those first, or this PR carries them.
- Day and Time are two ticket rows instead of one "When" row (D11-40).
- barbersCanBlockTime and barbersCanUploadPhotos no longer gate anything (D11-31).
- Pre existing time of day flake fixed: tests/integration/manualBookings.test.ts used "now plus 5 hours", which crosses midnight late in the day.

Data model (new or changed):

- alerts: open_queue
- customerNotes: uniq_phone (unique)
- bookings: by_name_key (nameKey, startAt)
- staffPins: uniq_staff (unique)
- setupTokens: uniq_tokenHash (unique), ttl_expiresAt (TTL), by_staff
- teamSessions: uniq_tokenHash (unique), ttl_expiresAt (TTL), by_staff
- loginThrottle and rateLimits reused for PIN lockout and the address limit

API contract (new routes, method and auth):

- public: POST /api/team/login, GET and POST /api/team/setup/:token
- team (13): POST /api/team/logout, GET /api/team/me, POST /api/team/pin, GET /api/team/today, GET /api/team/week, POST /api/team/bookings/:id/status, POST /api/team/bookings/:id/note, POST /api/team/walk-ins, GET /api/team/time-off, POST /api/team/time-blocks, DELETE /api/team/time-blocks/:id, POST /api/team/out-today, POST /api/team/days-off
- owner: GET /api/admin/search, GET /api/admin/overview, GET /api/admin/booking-table, GET /api/admin/schedule/week, GET /api/admin/customer-list, PUT /api/admin/customers/notes, POST /api/admin/alerts/:id/resolve and /dismiss, POST /api/admin/bookings/:id/resend, GET /api/admin/staff/:id/access, POST /api/admin/staff/:id/setup-link and /unlock, POST /api/me/email
- Auth levels are now public, team, owner, internal. /api/auth/login refuses barber accounts.

Tests: Vitest 451 passed, 0 failed (69 files). Authz matrix: 101 routes by 4 roles = 404 checks, plus the demo only routes. Playwright 102 passed, 1 skipped (dev); prod like 7; showcase 13; test:vercel-function 89.

- Coverage (whole repo): statements 96.28, branches 88.25, functions 97.82, lines 96.28
- Commands: npm run build; npm run typecheck; npm run lint; npm run format:check; npm run test:coverage; npx playwright test; npx playwright test -c playwright.prod.config.ts; npx playwright test -c playwright.demo.config.ts; npm run test:vercel-function
- Not run here: Lighthouse for the new screens, axe on the demo notice beyond the demo suite (light and dark, passed)
  Checks: typecheck clean, lint clean (max warnings 0), prettier clean, build clean (API bundle committed, 252 source files).

Design checklist:

- PASS owner at 1280x800 shows sidebar, search, quick actions, four tiles and Now and next; the chart title and bars are visible but its lower axis is cut at 800px high
- PASS barber portal at 390: Next up and the first two bookings visible without scrolling, tap targets 48px and up, PIN keys 64px
- PASS tiles show only real numbers; compare lines appear only when last week has data
- PASS every list has empty, loading and error states (e2e)
- PASS axe 0 violations in light and dark on every new screen (portal, dashboard, team, website, settings, demo notice, footer)
- PASS real table markup and a text alternative for the chart
- PASS prompt 10 tokens only, calm admin motion, no emoji (rules tests)

Commits:

- 9957ca3 dashboard kit gaps, owner shell and search (2026-10-18)
- ec1ac4e overview, bookings table and the booking panel
- 0e72495 schedule, customers, team and the alert resolver
- 8785a8a Owner dashboard M4: Website panels and Settings
- 49e1294 Barber portal M5: /team with PIN sign in, setup links, lockout and demo PIN
- a868ad3 Milestone 6: demo notice, icons, social links, outage fallback, guides and captures
- this report commit follows

Env vars: no new variables. MANAGE_LINK_SECRET (needed now) now also keys PIN hashing; rotating it invalidates every PIN, so use Reset PIN after a rotation. DEMO_MODE (demo builds) turns on the notice and the demo PIN 246810.

Open questions:

- Real TikTok and Facebook URLs, for Settings (Instagram is set).
- Does Dontrise want barbers to upload their own photos? Today it is owner only.

Known gaps and risks:

- Screens and recordings come from the demo build with sample data; not seen on a real phone.
- Owner guide screenshots at 1280 only for most screens; phone views for Overview and Bookings.
- AlertPanel fetches the overview to find its alert; fine at this size, worth an endpoint later.
- DemoNotice and the public layout each request /api/shop once on demo builds.
- Walk-in e2e tests hold a chair for 40 minutes, so a second local run within 40 minutes against a reused server can collide; CI starts fresh.
- Legacy admin.css element rules may still exist under the new dashboard styles.

Ready for next step: open the PR checks, merge PR 5 and 6 first or accept them in this one, then deploy and send each barber a setup link from Team, Access. The next prompt must not change the auth levels, the PIN hashing scheme, the one failure answer for PIN sign in, or the slotLocks transaction.
