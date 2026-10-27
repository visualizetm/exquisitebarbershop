REPORT 13D: BARBER PORTAL REDO, THE WEBSITE EDITOR, AND FIVE FIXES FROM 13C

Summary: The five 13c review items are fixed: NOW and the walk-in line obey the hours (one shared rule, SHOP_CLOSED and BARBER_OFF, the tile and the check in say why, a waiting entry whose barber goes off is flagged and never dropped), the time step is one scrolling day strip with the times under it, the check-in choices fill the tablet screen with icons, there is no green on the admin or portal surfaces, and "Keep this tablet signed in" is a per-device cookie flag instead of a shop-wide setting. The barber portal is redone dark at 390: Who's working cards, a PIN pad with Show and Hide, Today with the barber head, Add booking with NOW first, Out for the day as a full-screen confirm, In your chair with Start cut, Done and No show, the day list, and Me with the profile. The Website side is one editor: the section list with status tags, a live preview of the home page top fed the unsaved draft in a phone or computer frame, and the panel; the hero headline, red word and subline and the Visit words are settings, old addresses redirect, and a stale save is refused. Both guides are rewritten with new screens and the PDF re-rendered. Finishing a cut early now gives its time back to the chair.

Built:

- M0 fixes: shared/lib/openNow.ts, shared/api/line.ts (gate, firstAvailable, flag), shared/api/errors.ts (BARBER_OFF), server/services/line.ts, src/booking-flow/NewBookingFlow.tsx and flow.css (NOW closed state, the day strip), src/components/booking/TimePicker.tsx (copy), src/admin/today/WalkInLine.tsx (flag, no "unknown"), src/checkin/CheckInPage.tsx and checkin.css (choices fill, icons, Walk in greyed with the reason, chair states follow the hours), dashboard.css, admin.css, kit.css (no green), server/auth/cookies.ts and sessions.ts, server/http/routes/auth.ts (POST /api/auth/tablet), shared/schemas/shopSettings.ts (setting removed), server/repos/shopSettingsRepo.ts (legacy field dropped by runSeed), scripts/e2e-server.ts (open all day for the run)
- M1 portal: src/team/SignIn.tsx, TodayPage.tsx, MePage.tsx, src/components/ui/PinPad.tsx (revealable), src/styles/team.css, tokens.css (portal in the dark scope), shared/api/team.ts (price, arrivedAt, startedAt, chair, bio, Instagram), server/services/teamPortal.ts, server/http/routes/team.ts (arrived and start), server/services/adminBookings.ts and server/repos/slotLocksRepo.ts (locks released on done or no show, retaken on undo)
- M2 editor: src/admin/website/WebsiteEditor.tsx, sections.ts, src/styles/editor.css, src/admin/AdminApp.tsx (redirects), src/admin/shell/ownerNav.tsx, shared/schemas/shopSettings.ts (hero, visit), shared/lib/hero.ts, shared/api/public.ts, shared/api/admin.ts (updatedAt, expectedUpdatedAt), server/services/adminCatalog.ts (CONFLICT), server/http/routes/public.ts, seed/shop.ts, src/pages/HomePage.tsx, src/pages/VisitPage.tsx; deleted src/admin/website/WebsitePage.tsx
- M3 guides: docs/OWNER-GUIDE.md, docs/BARBER-GUIDE.md, docs/OWNER-GUIDE.pdf, docs/screens/p13d/guide/ (18 screens)
- Tests: tests/unit/openNow.test.ts (4), hero.test.ts (3), tests/integration/now.test.ts (7), tabletSession.test.ts (1), settingsEditor.test.ts (1), line, checkIn and authz updated; tests/e2e/portal13d.spec.ts (1 at 390 with axe on every screen), editor.spec.ts (2 at 1440 and 390 with axe), portal, flow, team, realshop, checkin, admin, website and dashboard specs updated
- Docs and screens: docs/DECISIONS.md D13d-01 to D13d-18, docs/PROGRESS.md, docs/ARCHITECTURE.md (three API rows), docs/screens/p13d/ (flow-now-closed-1440, flow-day-strip-1440, checkin-1180x820, checkin-820x1180, portal-signin-390, portal-pin-390, portal-today-390, portal-out-390, editor-top-1440, editor-top-390, montage.png, lighthouse.json)

Key decisions: the hours rule is one pure helper used by the server, the tile and the check in (D13d-01); flagged line entries, never dropped (D13d-02); the e2e server opens the shop all day with a special-hours closure and extra hours, the integration files freeze the clock (D13d-03); the day strip is the kit's chip row forced to one row (D13d-04); white and steel replace green (D13d-05); the tablet flag is a device cookie derived from the server secret, 30 idle days for that device's session only (D13d-06); the portal joins the dark token scope, Appearance left Me (D13d-07); Add booking opens with NOW picked, Out for the day is a full-screen confirm naming "the owner" (D13d-08); In your chair reads the floor's currentBooking rule, Start cut seats or stamps through chair-scoped routes (D13d-09); done early releases the rest of the locks, undo retakes them or fails (D13d-11); one editor at ?section with redirects (D13d-12); hero copy validated by zod and split into display lines by a shared helper (D13d-13); the preview is drawn from the draft, not an iframe (D13d-14); stale saves refused by updatedAt (D13d-15); chair states follow the hours before the estimate (D13d-18).

Deviations: the preview draws the home page top from the draft for every section; sections on other pages (hours, services, team, gallery, visit) get a line naming the page and View site, not a draft-fed render of that page (D13d-14). The announcement, photo, hours, services, reviews, gallery and team panels keep their own saves; the editor's draft, Undo and leave-without-saving cover the hero and the Visit words. "Keep this tablet signed in" lengthens the window on the next touch of the session, not at sign-in. Out for the day says "the owner" rather than Dontrise. The Website tab row has one tab because the editor has its own list.

Data model: shopSettings gains hero { headline, redWord, subline } and visit { parking, goodToKnow } and loses keepTabletSignedIn (unset by runSeed); slotLocks are released from the current block on completed or noShow and retaken on undo; no new collections or indexes.

API contract: POST /api/auth/tablet (owner); POST /api/team/bookings/:id/arrived and /start (barber); GET /api/admin/line and /api/team/line now carry gate per chair, firstAvailable and flag per entry; POST /api/admin/now, /api/team/now, /api/admin/line and /api/team/line refuse with SHOP_CLOSED or BARBER_OFF outside the hours; GET /api/admin/settings carries updatedAt and PUT takes expectedUpdatedAt (409 CONFLICT when stale); GET /api/shop carries hero and visit. Everything else unchanged.

Tests:

- Vitest 95 files, 680 passed, 0 failed; coverage statements 96.59%, branches 88.7%, functions 97.7%, lines 96.59%
- Playwright dev suite in the gate: 156 passed, 4 failed, 1 skipped; the 4 (portal head overflow at 390 from a late CSS change, the editor spec leaving the parking line set for the Visit spec, and one chair-state collision that passed on rerun) fixed and rerun: checkin, dashboard, editor, realshop 36 passed; flow and portal13d passed. Prod-like 7 of 7, showcase 13 of 13, test:vercel-function 97 passed
- Commands: /tmp/gate.sh (build, typecheck, lint, format:check, test:coverage, dev, prod-like and showcase Playwright, test:vercel-function); PRODLIKE_SKIP_BUILD=1 npx playwright test -c playwright.prod.config.ts; npx playwright test -c playwright.demo.config.ts; npx playwright test tests/e2e/editor.spec.ts tests/e2e/realshop.spec.ts

Checks: typecheck clean, lint clean, format clean, build clean, API bundle rebuilt and proven under plain Node.

Checklist:

- PASS NOW and the line refuse when the shop is closed or the barber is off or done, and the tile says why (openNow.test frozen at Mon 9:10 PM; now.test with a closure and a day-off block; flow-now-closed-1440.png)
- PASS the time step is the day strip with the times right under it, no month grid (flow-day-strip-1440.png; flow.spec)
- PASS the check-in choices fill the screen at 1180x820 and 820x1180 (checkin.spec measures 64px and up; the two screens)
- PASS no green in the admin, the portal or the check in (every --ok use on those surfaces is white or steel; the token stays for the public setup page)
- PASS the tablet sign-in extends only that device's session (tabletSession.test: 30 days with the flag, 14 without, a made-up flag ignored)
- PASS portal: card and PIN sign-in, Add booking with NOW, Start, Done, No show, Out for the day and Sign out at 390 (portal13d.spec, portal.spec)
- PASS editor: the live preview follows unsaved edits and Save and publish shows the change on the public site (editor.spec); the hero copy comes from settings (settingsEditor.test, /api/shop); portraits replace the no-photo panel (the first staff photo, unchanged); old Website addresses redirect (website.spec, dashboard.spec)
- PASS the guides are rewritten, their screens recaptured and the PDF re-rendered
- PASS tap targets 44px or more, PIN keys 64px (portal13d.spec measures the keys; checkin.spec every button and link); axe clean on the portal screens at 390, the editor at 390 and 1440, the check in at 1180 and 820
- PASS Lighthouse mobile Home 85 (FCP 2.0 s, LCP 3.9 s, TBT 150 ms, CLS 0), accessibility 100, best practices 96, SEO 63 (the demo build is noindex, as before); at the line, see risks

Commits: b3b1829 the five 13c fixes; 9ef718e the barber portal redo; bfb00cd the website editor; 834408c the guides and the chair states; the SHIP commit with the spec fixes and this report follows.

Env vars: none new.

Open questions: Rob to confirm the hero copy wording and the Visit parking line (both editable now); whether the preview should also draw the Visit and Services pages from a draft (a later prompt); the Sign out button's place on the portal head.

Known gaps and risks: Lighthouse Home sits at 85 with LCP 3.9 s on the simulated phone (the hero photo), one point from the floor; the preview's computer frame is a fixed 0.42 scale; the editor embeds the Team page (its own heading and title) rather than a trimmed team panel; the e2e server's all-day hours mean the suite never sees the closed state on screen, only the integration and unit tests do; the tablet flag cookie is a bearer flag (harmless without a session, logged in D13d-06); the line is empty in the guide screens because the demo is captured before opening time; the public pages cache /api/shop for a minute, so an edit shows on the site within a minute, not at once.

Milestone times: M0 15 minutes (11:06 to 11:21 UTC), M1 32 minutes (to 11:53), M2 20 minutes (to 12:13), M3 about 15 minutes (to 12:28), SHIP from 12:28.

Needs Rob's phone and tablet: the portal on a real phone (cards, the PIN pad's Show and Hide, Add booking, Start cut, Out for the day); the check in on the shop tablet sideways and upright during open hours (the greyed Walk in outside them); the editor on the laptop with a real photo upload and Save and publish.

Ready for next step: the next prompt starts from the editor (src/admin/website/WebsiteEditor.tsx) and the portal (src/team/TodayPage.tsx). It must not change the hours rule in shared/lib/openNow.ts and bookNow, NewBookingFlow's entry points, the line service, the slot locks, the pricing rule, the reviews writer, the seed photo ids, the carousel, the reveal tokens or the public booking rules.

Production: PR 15 merged into main as 92bf393 at 13:07 UTC with both CI runs and the Vercel preview green. Vercel's status on the merge commit reads "Deployment has completed" (success) at 13:07:26 UTC. The health URL is not reachable from this sandbox, so Rob checks /api/health once for buildSha 92bf393.

92bf393, production: ready
