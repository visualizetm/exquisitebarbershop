# Audit findings (prompt 6, milestone 1)

Written before any fix, so the findings stand on their own. Date 2026-10-17,
branch `claude/practical-maxwell-t6zzzk` at 5b2a7bb. The LIVE URL placeholder
in the brief was not filled in and the Vercel preview address is not reachable
from this sandbox (the outbound proxy refuses vercel.app), so every live-only
check (headers on the live site, the production backup listing) is marked
"not verifiable here" with the exact command for Rob. Everything else was run
on the local e2e server and the production build (`vite preview`).

## Captures

`docs/screens/audit/`: Home, Services, The chairs, Marcus, The work, Visit,
Manage (empty and with a booking), every Book step (services, chair, day, time,
details, confirm, done), admin Today, Schedule, New booking, Photos, Settings,
at 390x844 and 1280x800 in light and dark. Montages: `montage-light-390.png`,
`montage-light-1280.png`, `montage-dark-390.png`, `montage-dark-1280.png`.
`facts.json` holds the page facts below (`npx tsx tests/e2e/audit.ts`).

## Page facts (390 wide, light, dev server)

| Page            | Fonts | Sizes             | Text colors | Backgrounds | Radii          | LCP ms | CLS   | Console errors                        |
| --------------- | ----- | ----------------- | ----------- | ----------- | -------------- | ------ | ----- | ------------------------------------- |
| /               | Jost  | 14 16 18 34 48    | 6           | 4           | 16, pill, arch | 580    | 0.034 | 0                                     |
| /services       | Jost  | 14 16 18 48       | 5           | 3           | pill           | 432    | 0.001 | 0                                     |
| /chairs         | Jost  | 14 16 18 48       | 6           | 4           | 16, pill, arch | 636    | 0.001 | 0                                     |
| /chairs/marcus  | Jost  | 14 16 18 34 48    | 5           | 4           | 16, pill, arch | 576    | 0.001 | 0                                     |
| /gallery        | Jost  | 14 16 48          | 4           | 4           | 16, pill       | 524    | 0.001 | 0                                     |
| /visit          | Jost  | 14 16 18 24 34 48 | 5           | 3           | pill           | 508    | 0.001 | 0                                     |
| /book           | Jost  | 14 16 24 34       | 5           | 4           | 16, pill       | 480    | 0.001 | 0                                     |
| /admin          | Jost  | 14 16 18 24       | 5           | 3           | 8, 16, pill    | 592    | 0.737 | 2 (401 on the sign-in page, expected) |
| /admin/schedule | Jost  | 14 16 18 24       | 3           | 1           | 16, pill       | 532    | 0.334 | 2 (same)                              |
| /admin/photos   | Jost  | 14 16 24          | 4           | 4           | 8, 16, pill    | 584    | 0.200 | 2 (same)                              |

- Button styles: primary red pill (36, 44 or 52px), secondary ghost pill,
  inverse paper on ink, emphasis on the summary card; admin plain buttons
  pill at 36 to 40px. One radius family (8 inside admin cards, 16, pill, arch).
- Clickables under 44px on public pages: the nav "Book a chair" (36px), inline
  text links at 23px ("Full menu", "See the gallery", "See all of Marcus's
  work", the phone, the email, the Instagram handle, "Staff sign in"). Admin:
  Previous day, Next day (40px), Block time, Save, Up, Down, Remove (36px).
- Images: every image has alt. Oversized: gallery and chair photos are stored
  once at up to 2000px and shown at 290 to 780 device pixels, so most are 2 to
  3.5 times larger than needed (no responsive variants). The hero is 1600 for
  780, just over 2x.
- Scroll: 5 listeners registered per page (React and Vite dev client, all
  passive); no scroll hijacking, native scroll everywhere.
- Fade-in hidden content: none. Gradients: only the hero scrim.
- Title, description and H1 are distinct and correct on every public page;
  admin pages carry the site default description (noindex, so harmless).
- Lighthouse mobile on the production build: Home 91 performance (CLS 0.103,
  from the hero growing when the photo arrives), profile 97 (CLS 0), Book 96
  (CLS 0); accessibility 100, best practices 100, SEO 100 on all three. Main
  bundle 527 KB (156 KB gzip, 89 KB unused on first paint), admin chunk 107 KB.

## Scorecard before fixes (0, 1, 2)

| #   | Category              | Score | Reason you can check                                                                                                                                                                                                                                                                                   |
| --- | --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Message               | 2     | Hero reads what, for whom and why with Book a chair at 390 without scrolling (`home-light-390.png`)                                                                                                                                                                                                    |
| 2   | Hierarchy             | 2     | One H1 per page, section labels, prices and times in tabular numerals, six sizes or fewer                                                                                                                                                                                                              |
| 3   | Signifiers and states | 1     | The phone sticky bar hides as soon as a service checkbox gets focus (`StickyCTA` treats every input as a text field), so after tapping a service the Continue bar disappears until the tap lands elsewhere; the review step shows two Confirm buttons on a phone                                       |
| 4   | Typography            | 2     | Jost only, 14 to 48px, uppercase 700 headings, body 16                                                                                                                                                                                                                                                 |
| 5   | Color                 | 2     | Only tokens; red for actions and live states; contrast passes axe in both themes                                                                                                                                                                                                                       |
| 6   | Spacing and layout    | 2     | 4pt grid, 1200 wrap, two columns from 1024 on Book, nothing overflows at 390                                                                                                                                                                                                                           |
| 7   | Imagery               | 1     | Every photo has alt and dimensions, lazy below the fold, but served up to 3.5x oversized (one stored size)                                                                                                                                                                                             |
| 8   | Motion and hover      | 2     | Hover brightens only, 150ms state transitions, off under reduced motion, no reveals                                                                                                                                                                                                                    |
| 9   | Mobile                | 1     | Tap targets under 44px (nav button 36, text links 23, admin 36 to 40) and the sticky bar bug above                                                                                                                                                                                                     |
| 10  | UX depth              | 1     | Chair step needs a Continue tap after picking a chair while the day and time steps advance on tap; the manage link on the done screen is a raw URL; the done screen's "Book another appointment" is a bare text link                                                                                   |
| 11  | Originality           | 2     | AI-look flags: 0 (no purple, no bento, no glass, no fake stats or reviews, one gradient and it is the photo scrim)                                                                                                                                                                                     |
| 12  | Accessibility basics  | 2     | axe 0 violations in both themes, skip link, focus moves to each step heading, every image has alt                                                                                                                                                                                                      |
| 13  | Performance           | 1     | Home CLS 0.103 on the production build when a hero photo is set; oversized photos; 89 KB unused JavaScript on first paint                                                                                                                                                                              |
| 14  | QA                    | 1     | Two bugs carried from report 05 (per-IP login limit counts successes; e2e rate limits trip on reruns), the sticky bar bug, the duplicate Confirm, and one wall-clock dependent Vitest case (the manualBookings idempotency case picks seven hours from now, which lands after closing late in the day) |

Total before: 22 of 28. No category scores 0.

## Flows walked

First-time customer at 390 (`book-*-light-390.png`): services, chair, day,
time, details, confirm, done, manage link.

- Dead end: after tapping a service the sticky Continue bar vanishes (bug
  above); the inline Continue is hidden on phones, so the customer has to tap
  somewhere neutral first. Fix in milestone 2 with a regression test.
- Extra tap: picking a chair does not advance; day and time do. Keep (a chair
  is a considered choice and the card shows a selected state), note only.
- Unclear label: none found; "Anyone available" and "Review booking" read
  plainly. The confirm step shows "Confirm booking" twice on a phone (sticky
  bar and inline). Fix: drop the inline one on phones.
- Done screen: the manage link is printed raw under "Keep this link"; it works
  but is ugly. Small fix: label it "Manage this booking" and keep the raw URL
  out of the page (the email carries it).

Owner's day at 390 (`admin-*`): sign in, Today, status switch with Undo, New
booking sheet, Schedule with Block time, Photos, Settings.

- Today loads in two stages (summary, then chairs), which is the 0.737 CLS;
  nothing jumps after the first second. Small fix: reserve the chair list
  height while loading.
- New booking: the service checkboxes are native 16px boxes inside 44px rows;
  rows are tappable. No dead ends. "Book it" sits at the very bottom of a long
  form at 390; acceptable in a sheet.
- Schedule: Previous day and Next day are 40px tall; small fix to 44.

## Security and reliability review (re-derived from code)

Routes: 77. Every body goes through `parseBody` with a zod schema and every
query and path parameter through `parseQuery` or `parseParams`; the router
refuses to start with an unknown auth level. Owner routes call `ownerScope`
again in the handler; barber routes work in `chairScope` and every service
checks the record against it (`assertInScope`), answering NOT_FOUND for other
chairs' ids. Photos routes are level barber with the owner-or-own-chair check in
the service, including the ticket's staffId on confirm. Internal routes take
the cron bearer in constant time; bootstrap routes also take BOOTSTRAP_SECRET
and read as 404 while it is unset.

- Rate limits: login per IP (20 per 15 min) and per email (10 per 15 min) with
  lockouts; bookings per IP (10 per 10 min) and per phone (5 per day); manage
  links per IP (10 per 10 min); password change per login. Not limited:
  `/api/availability*`, `/api/staff`, `/api/services`, `/api/gallery`,
  `/api/shop` (public, cached 10 to 60 seconds, read only). Low: a flood can
  raise database load; Vercel's own protection and the cache sit in front.
- Error leakage: `sendError` returns only the code, a safe message, the request
  id and zod field paths; 500s log the cause server side and answer "Something
  went wrong on our side". The doctor never returns values; connection strings
  are masked in its messages.
- Secrets: the built bundle contains no connection string, key or secret value
  (the only match is the label "BOOTSTRAP_SECRET" on the setup field). The
  full git history has no `.env` file and no secret-shaped string. There are
  no `VITE_` variables at all.
- Headers and CSP: `vercel.json` sets CSP (script-src self plus the one hash,
  no unsafe-inline for scripts), nosniff, DENY, Referrer-Policy, HSTS and
  Permissions-Policy. Not verifiable on the live site from here: run
  `npm run smoke -- --url=https://<site>` or the Smoke test Action; the
  "Security headers" line checks all six.
- Cookie (local login response): `__Host-exq_session=...; Path=/; HttpOnly;
Secure; SameSite=Lax; Max-Age=1209600`. Sign-in rotates the token.
- CSRF: every mutating request must carry an allowed Origin before routing.
- Concurrency: the booking race (25 parallel bookings for one slot, exactly one
  wins, no orphaned lock) passed 10 of 10 reruns; the schedule guard race (a
  schedule change against bookings on the same chair) passed 10 of 10.
- Data safety: the production backup listing needs the R2 credentials or the
  cron secret, neither of which this session has. Not verifiable here: Rob
  opens the R2 bucket and checks `_backups/<today>/manifest.json`, or runs
  `curl -H "Authorization: Bearer <CRON_SECRET>" https://<site>/api/internal/cron/daily`
  and reads `backup.documents`. The restore drill ran on local: the backup and
  restore round trip into a scratch database restored every collection with
  Dates and ids intact, and the live database was refused without `--force`
  (`tests/integration/backup.test.ts`, 3 passed).
- Findings to fix: none critical. (S1) the per-IP login limit counts successful
  sign-ins (report 05 bug): only failures should count. (S2) the Playwright
  run shares rate-limit windows with earlier runs on the same server: give the
  e2e server a reset hook that Playwright calls once per run, outside the
  production code path, and leave production limits as they are.

## Fix list

Milestone 2 (0 scores: none; security and report 05 bugs; QA): S1 login IP
limit; S2 e2e rate-limit namespace; the StickyCTA focus bug; the duplicate
Confirm on phones; Home hero CLS with a photo; the wall-clock dependent test.
Each with a regression test.

Milestone 3 (1 scores, small and safe): tap targets to 44px on touch
(nav button, inline text links, admin day buttons and small buttons); the raw
manage URL on the done screen; reserve the Today chair list height while it
loads. Not small, left as documented: responsive photo variants (two sizes per
upload) and the unused JavaScript on first paint.
