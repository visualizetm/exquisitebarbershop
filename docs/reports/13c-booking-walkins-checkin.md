REPORT 13C: FULL-SCREEN NEW BOOKING WITH NOW, THE WALK-IN LINE, THE FRONT DESK CHECK IN

Summary: Every booking flow now opens the one full-screen popup (NewBookingFlow): the top bar's New booking, Add walk-in, Move to another barber, Reschedule, the portal's Add booking and Walk-in, and the check-in tablet's Walk in. The time step leads with NOW: a free chair with nobody ahead gets a walk-in booking this minute through the booking service and slot locks, anyone else joins the walk-in line with an estimate; only owner and barber sessions can do it. The line is a collection with wait estimates computed from the floor, seated from Today or a free chair card with one tap, moved, reordered or marked left. The front desk check in is a full-screen tablet page at /admin/checkin and /team/checkin with giant Walk in and I have an appointment targets, each chair's state, a masked lookup by name or the last 4 of a phone, and an arrived tap. Archivo is instanced to the width axis the site uses and self-hosted, and Home measures 92 on Lighthouse mobile.

Built:

- M0 font and Today: public/fonts/archivo-latin-wdth-normal.woff2 (62 KB), src/styles/fonts.css, index.html (one preload), vite.config.ts, vercel.json (immutable /fonts), scripts/brand-assets.ts, scripts/guide-pdf.ts, src/admin/bookings/BookingsPage.tsx (week chart and recent activity), src/admin/today/TodayPage.tsx, CLAUDE.md (the standing rule), package.json (fontsource package removed)
- M1 line: shared/schemas/walkIn.ts, shared/api/line.ts, shared/lib/waitEstimate.ts, server/repos/walkInsRepo.ts, server/db/collections.ts, server/db/indexes.ts, server/services/line.ts, server/services/floor.ts (line and seatWalkIn in the floor response), server/services/bookingService.ts (arrived at insert), server/http/routes/admin.ts, server/http/routes/team.ts, src/admin/today/WalkInLine.tsx, src/admin/today/estimateLabel.ts, src/styles/dashboard.css
- M2 flow: src/booking-flow/NewBookingFlow.tsx, src/booking-flow/flowData.ts, src/booking-flow/flow.css, src/components/ui/Dialog.tsx (full variant, nested dialog events), src/styles/kit.css, tokens.css, motion.css, src/admin/shell/AdminShell.tsx, src/admin/shell/quick.ts, src/admin/bookings/BookingSheet.tsx (Move and Reschedule open the flow), src/team/TodayPage.tsx, src/styles/team.css; deleted src/admin/panels/NewBookingPanel.tsx, the portal WalkInForm and the RescheduleForm
- M3 check in: shared/api/checkIn.ts, server/services/checkIn.ts, server/auth/sessions.ts (30 day idle window), shared/schemas/shopSettings.ts (keepTabletSignedIn), src/checkin/CheckInPage.tsx, src/styles/checkin.css, src/admin/AdminApp.tsx, src/team/TeamApp.tsx, src/admin/settings/SettingsPage.tsx, server/bundle/app.mjs
- Tests: tests/unit/waitEstimate.test.ts (7), tests/integration/line.test.ts (4), now.test.ts (4), checkIn.test.ts (3), authz.test.ts (121 routes), tests/e2e/flow.spec.ts (5 at 1440 and 390), checkin.spec.ts (3 at 1180x820 and 820x1180), dashboard, team, realshop, portal specs updated
- Docs and screens: docs/DECISIONS.md D13c-01 to D13c-16, docs/PROGRESS.md, docs/ARCHITECTURE.md (walkIns collection, nine API rows), docs/screens/p13c/ (flow-time-now-1440, flow-barber-now-390, today-line-1440, checkin-start-1180, checkin-lookup-1180, montage.png, lighthouse.json)

Key decisions: the font instanced to wdth 100 to 125 with fonttools instead of the fontsource package, 62 KB against 91 KB (D13c-01); the line stores E.164 phones and shows them formatted, so client lookups match (D13c-04); estimates are pure and shared, "Free", "about <time> (n min)" or "unknown", never an unsupported number (D13c-05); seating claims the entry first then books through createManualBooking with slot locks, so two taps make one booking (D13c-06); the line rides in the floor response so Today keeps one poll (D13c-07); NOW is decided on the server in bookNow, public /api/bookings keeps the grid and lead time (D13c-08); Seat stays a one-tap action, the flow is for new bookings (D13c-09); Move and Reschedule post to the existing reschedule route so repricing, lock swaps and the email are unchanged (D13c-10); the nested Discard modal works because Dialog ignores close and cancel events from a nested dialog (D13c-12); one check-in component at two addresses because owner and barber sessions live in different cookies and apps (D13c-13); masking at the API, not the client (D13c-14); "Keep the check-in tablet signed in" lengthens every owner session's idle window to 30 days, logged as a trade-off (D13c-15).

Deviations: Seat from the line and a free chair's "Seat walk-in #n" are one-tap actions, not a trip through the flow (the person is already in the line with services and chair). The check in has two addresses, /admin/checkin for the owner and /team/checkin for a barber, instead of one. The portal's Check in is a ghost button next to Walk-in and Add booking. The tablet setting applies to every owner session, not one device.

Data model: walkIns (status_position on status, position; createdAt); shopSettings gains keepTabletSignedIn (boolean, default false); bookings and slotLocks unchanged (walk-ins booked now take locks like any booking). All other collections unchanged.

API contract: GET, POST /api/admin/line (owner); PATCH /api/admin/line/:id (owner); POST /api/admin/line/:id/move, /seat, /left (owner); POST /api/admin/now (owner, Idempotency-Key); GET /api/admin/checkin/lookup (owner); POST /api/admin/checkin/:id/arrived (owner); GET, POST /api/team/line (barber); POST /api/team/line/:id/seat (barber); POST /api/team/now (barber, Idempotency-Key); POST /api/team/bookings (barber, Idempotency-Key); GET /api/team/checkin/lookup (barber); POST /api/team/checkin/:id/arrived (barber). Error codes added: CHAIR_BUSY, ALREADY_SEATED. Audit actions added: line.add, line.update, line.move, line.left, line.seat. Everything else unchanged; /api/now does not exist.

Tests: TESTS_TBD

Checks: CHECKS_TBD

Checklist:

- PASS NOW first on the time step (flow.spec asserts it sits above the days), books when the chair is free, joins the line when busy (now.test: free chair gives a walk-in booking with arrivedAt and locks off the grid; busy gives a line entry and no booking)
- PASS only owner and barber sessions can NOW or book off-grid: now.test sends the public /api/bookings an off-grid start and gets 400 or 409, and /api/now answers 404; authz covers all 121 routes
- PASS no double booking under concurrency: two seats into one free chair give 201 and 409 with one booking (line.test); two barber NOWs give one booking and one line entry (now.test)
- PASS line add, seat, move, left and reorder from Today with real-data estimates (line.test on the API; dashboard and checkin specs through the panel; today-line-1440.png)
- PASS check in at 1180x820 upright and 820x1180 sideways with the masked lookup (checkin.spec: walk in to a free chair and to the line, find by the last 4, arrived stamped, no phone, last name or email on the screen; checkIn.test on the API)
- PASS the drawer and the portal forms are deleted and every entry point opens the full-screen popup: flow.spec at 1440 and 390 asserts a full dialog and no side sheet for New booking, Add walk-in, Move, Reschedule, portal Add booking and Walk-in; checkin.spec for the tablet's Walk in
- PASS the standing rule is in CLAUDE.md under Conventions
- PASS Lighthouse mobile Home 92 (FCP 2.1 s, LCP 2.4 s, TBT 130 ms, CLS 0.002), accessibility 100, best practices 96, SEO 63 (the demo build is noindex, as before); docs/screens/p13c/lighthouse.json
- PASS tap targets 44px: checkin.spec measures every visible button and link (64px on the two main choices); flow.spec measures the bar and ticket buttons at 390
- PASS axe clean on the flow at 390 and 1440 (client step), the check in start and lookup at 1180, and the portal check in at 820

Commits: 39c3a41 font instancing, chart and activity under Bookings, the standing rule; 0c229a8 the walk-in line; 61b8ac7 the full-screen flow with NOW, Move and Reschedule; 2ca7bbc the front desk check in; SHIP commit with screens, architecture rows and this report follows.

Env vars: none new.

Open questions: Rob to confirm the two-address check in (the owner's tablet uses /admin/checkin, a barber's uses /team/checkin) and the wording of the end screens; whether the line should also show on the Bookings tab.

Known gaps and risks: the tablet setting lengthens every owner session, not one device; a barber's check in only finds that barber's bookings, so a shared desk tablet should be signed in as the owner; estimates assume each person ahead takes the first gap that fits, a real floor drifts; the Wake Lock is untested on a real iPad; the owner guide does not yet describe the line or the check in (13d); the time step's "closed that day" note runs two sentences together (pre-existing DayPicker copy).

Milestone times: M0 12 minutes (00:04 to 00:16 UTC), M1 about 35 minutes (to 00:50 with the heartbeat), M2 about 25 minutes of flow work plus the discard fix (commit 00:50), M3 18 minutes (00:50 to 01:08), SHIP from 01:08 (build, Lighthouse, captures, gate, report, PR).

Needs Rob's tablet and phone: the check in on the real shop tablet, upright and sideways, through a walk-in and an appointment (does the screen stay awake, do the big tiles feel right); the flow at 390 on a barber's phone through a NOW walk-in; the line on Today at 1180 through a busy hour.

Ready for next step: 13d (the barber portal redo and the website editor) starts from src/team/TodayPage.tsx and src/admin/website/. It must not change NewBookingFlow's entry points, the NOW rule in bookNow, the line service, the slot locks, the pricing rule, the reviews writer, the seed photo ids, the carousel, the reveal tokens or the public booking rules.

Production: PRODUCTION_TBD

MERGE_TBD, production: ready
