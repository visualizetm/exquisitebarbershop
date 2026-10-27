REPORT 13g: A 15 SECOND COUNTDOWN ON THE TABLET'S END SCREENS, AND THE BOARD FITS
Summary: Every end screen (the tablet's and the owner's check in page) now shows "Closing in 15" counting to 1 with a stepped red bar and a 64px Done, then returns to a cleared start screen. The start screen fits one screen at 1180 x 820 and 820 x 1180 with five barbers working, and the barber tiles show a photo or an initials circle instead of the shop mark. Milestone times: M1 12 min, M2 15 min, M3 8 min, SHIP 25 min.
Built:

- Countdown: src/checkin/CheckInPage.tsx (END_SCREEN_SECONDS, EndScreen), src/styles/checkin.css
- Fit and initials: src/checkin/CheckInPage.tsx (Board tiles), src/styles/checkin.css
- Tests: tests/e2e/kiosk.spec.ts, tests/e2e/checkin.spec.ts
- Docs: docs/DECISIONS.md D13g-01 to D13g-04, docs/PROGRESS.md, docs/OWNER-GUIDE.md section 8b and .pdf, docs/screens/p13g (board and closing at 1180x820 and 820x1180, montage, guide/t02 and t05)
  Key decisions: One interval inside the end screen component, not a timer in the page (it cannot outlive the screen). The live region announces the message and a static "Closing in 15 seconds" once; the changing number is hidden from screen readers. Fit in the prompt's order: choices to 34vh, one row of five sideways, then a smaller start heading, smaller choice titles and tighter tiles.
  Deviations: The demo has four barbers in today (Iniya is off), so the screens show four tiles; the five barber fit is asserted in the e2e, which has five working. The count line shows 1 (never 0) in the last second, then the screen closes. The owner's checkin spec waits up to 25 seconds in real time for the countdown (that spec is not frozen-clock).
  Data model: unchanged.
  API contract: unchanged.
  Tests: unit and integration 699 passed, 0 failed; dev e2e 166 passed, 1 failed in the full run (tests/e2e/team.spec.ts block time resolver, the same order dependent failure as in 13f, 8 of 8 passed rerun alone, it does not touch the check in page); prod-like 7 passed; showcase 13 passed; vercel-function 97 passed; CI green on the PR head. Commands: npm run typecheck && npm run lint && npm run format:check && npm run test:coverage && npm run build && npx playwright test && npx playwright test -c playwright.prod.config.ts && npx playwright test -c playwright.demo.config.ts && npm run test:vercel-function
  Checks: typecheck clean, lint clean, format clean, build clean, CI green. Vercel production for the merge commit and the three production URLs could not be read from this sandbox (the proxy refuses the domain, as in 13f); Rob checks.
  Commits: 59493cc countdown; c5da834 board fit and initials; fab026b guide and screens; merge **MERGE_SHA**
  Env vars: none.
  Open questions: none.
  Known gaps and risks: The stepped bar is hidden under reduced motion, as asked, so those clients see the number only. Tiles with a long status ("With a client, free about 3:19 PM") wrap to three lines at 1180 wide; the fit test covers a busy barber.
  Checklist: Every end screen shows Closing in 15 counting to 1, the bar and Done, then returns to a cleared start screen at 0: pass (e2e). Done closes at once, other taps do not extend it, no timer is left after the screen changes: pass. The screen reader hears the message and the closing line once each: pass in markup and the e2e reads the live region; not tested with a real screen reader. The start screen fits with no scroll at both sizes with five working barbers: pass (e2e). Tiles show photos or initials, never the shop mark: pass. Axe clean on the end screen and the start screen: pass.
  Ready for next step: Rob checks the countdown on the real tablet. The next prompt must not change the kiosk cookie and level, the kioskDevices shape, the board's rule in the line service, the hours rule, the booking service, the pricing rule or the discounts.
  5c2c7f0, production: ready (Vercel: Deployment has completed; the production URLs not read from this sandbox)
