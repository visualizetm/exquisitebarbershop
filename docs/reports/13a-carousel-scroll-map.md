REPORT 13A: TODAY'S CHAIRS CAROUSEL, SMOOTH PHONE SCROLLING, VISIT MAP, FOUR FIXES

Summary: Today's chairs is a snapping carousel under 1024px with dots and a cautious auto-advance; the grid from 1024px is untouched. Scroll reveals are lighter (8px, 280ms, 40ms stagger, started early) and a new spec proves no public page scrolls sideways at 360, 390 or 414. Visit has a lazy Google map under the address with Directions below it, and the CSP allows the frame. The hero scrim is a measured directional gradient, a chair without a portrait shows a compact numbered panel, Iniya's phone bar says CALL and MESSAGE ON INSTAGRAM, and the lightbox test counts only barber links. Front end only: no schema, API or database change.

Built:

- M1 carousel: `src/components/site/carouselAutoplay.ts`, `useCarousel.ts`, dots in `TodaysChairs.tsx`, strip rules in `base.css`, dots in `pages.css`; `tests/unit/carouselAutoplay.test.ts`, `tests/e2e/carousel.spec.ts`
- M2 scrolling: `tests/e2e/scroll.spec.ts`, tokens `--d-reveal` and `--stagger-reveal`, `motion.css` reveal rules, `useReveal` rootMargin, passive viewport listener in `BottomBar.tsx`, dvh on body, `tests/unit/motionCss.test.ts`
- M3 map and fixes: `src/components/site/VisitMap.tsx`, `mapEmbedUrl` in `src/lib/shop.ts`, `VisitPage.tsx`, `vercel.json` frame-src, the hero gradient in `pages.css` and tokens, the no-photo panel in `PhotoFrame.tsx` and `kit.css`, the Instagram bar in `ChairPage.tsx` and `barStore.ts`, `tests/e2e/p13a.spec.ts`, `heroScrim.test.ts`, `csp.test.ts`, `site.spec.ts`
- Screens: `docs/screens/p13a/` (home-chairs, chair-drew, chair-iniya, visit-map at 390 and 1280 light, montage.png, lighthouse.json)

Key decisions (D13a-01 to D13a-12 in docs/DECISIONS.md):

- Native scroll snap, no library (D13a-01); the autoplay timer apart from the DOM, pointercancel counts as a swipe (D13a-02); the carousel region named "Today's chairs carousel" to avoid two regions with one name (D13a-03).
- Reveals kept, lighter, started 15% early; nothing clipped with overflow-x hidden since nothing overflowed (D13a-05, D13a-06).
- The hero gradient runs bottom to top, not left to right: on a phone every line spans the full width, and a right-to-left gradient measured 3.57:1 for the red line (D13a-09).
- The map's tap-to-move layer on touch screens; with a mouse the map takes the pointer at once (D13a-08).

Deviations:

- The hero gradient's lighter zone is the top band, not the right side, for the contrast reason above. At 1280 the photo stands in its own column, so no scrim applies there.
- The milestone 1 carousel region label is "Today's chairs carousel" rather than "Today's chairs".
- Two realshop.spec checks were narrowed after the gate: the no-photo panel carries the Q mark (an img) and the name, which the old checks counted as a portrait and a duplicate name.

Data model: no change. API contract: no change.

Tests:

- Vitest 86 files, 643 passed, 0 failed; coverage statements 96.64%, branches 88.82%, functions 98.07%, lines 96.64%
- Playwright full dev suite 147 passed, 2 failed, 1 skipped in the gate; the 2 (realshop.spec, Iniya) narrowed and rerun once: 6 of 6 pass. Prod-like 7, showcase 13, test:vercel-function 97
- Commands: /tmp/gate.sh (build, typecheck, lint, format:check, test:coverage, dev, prod-like and showcase Playwright, test:vercel-function); npx playwright test tests/e2e/realshop.spec.ts -g "Iniya takes bookings on Instagram"

Checks: typecheck clean, lint clean, format clean, build clean.

Checklist:

- PASS carousel snaps, swipes sideways without moving the page, auto-advances only as specified (carousel.spec: 3 of 3; unit: 6 of 6)
- PASS no sideways page scroll at 360, 390, 414 (scroll.spec on 10 public pages)
- PASS reveals 8px and 280ms, nothing in the first screen hidden (motionCss.test, motion.spec)
- PASS map lazy, not trapping scroll, Directions under it (p13a.spec)
- PASS hero contrast over the text boxes on the real photo: 390 red 5.08:1 white 10.6:1; 768 red 4.90:1 white 8.92:1; 1280 text on ink, red 6.07:1 white 18.88:1
- PASS chair page first screen at 390 shows the name and the Book button (p13a.spec, docs/screens/p13a/chair-drew-light-390.png)
- PASS tap targets 44px; axe clean at 390 and 1280 in light and dark on Home, Drew, Iniya and Visit (rules.spec and chrome.spec in the gate)
- PASS Lighthouse mobile: Home 88 (report 12: 81), Visit 95, CLS 0 on both, accessibility 100 (docs/screens/p13a/lighthouse.json)

Commits: f3b4252 M1 carousel; d7784bb M2 scrolling and reveals; fe91853 M3 map, scrim, panel, bar; the SHIP commit (tests, screens, report) follows.

Env vars: none new.

Open questions: none. Milestone times: M1 6 minutes (01:20 to 01:26 UTC), M2 4 minutes (to 01:30), M3 10 minutes (to 01:40), SHIP from 01:40.

Known gaps and risks:

- The map frame does not load in the local sandbox (no Google reach), so the Visit screenshot shows its empty frame; the attributes and the layout are tested, the tiles are not.
- Auto-advance is not tested on a real touch screen; the pointercancel rule is what stops it on a swipe.

Needs Rob's phone: swipe the carousel on Home, scroll past the map on Visit, and check the hero photo on a real iPhone.

Ready for next step: the single next step is Cloudinary for the photos (the report 12 Gallery score). Do not change the carousel's snap rules, the reveal tokens or the measured hero gradient without a new measurement.
