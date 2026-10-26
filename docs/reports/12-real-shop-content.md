REPORT 12: REAL SHOP CONTENT (FACTS, TEAM, PER BARBER PRICES, PHOTOS, REVIEWS)
PHOTOS: all delivered. 15 in seed/photos/manifest.json after removing exq-15-part-taper (the same photo as exq-12-hard-part); every file exists.
Summary: The seed now holds the real shop: 3309 Edgmont Ave Suite F, (610) 609-0786, closed Monday and 10:00 to 19:00 Tuesday to Sunday, the real team (Dontrise, Lee, Drew, Nelly Cutz, Iniya) and the 15 real services. Barbers carry their own prices and times, used from availability through booking, moves, emails and the owner views; a barber's own page shows exact prices and "From" appears only shop-wide and for first available. The 15 shop photos load through the active storage driver on demo setup, Reset and npm run photos:seed, and fill the hero, Home, the gallery and the chair pages. 18 real reviews show on Home and the chair pages, managed in a new Website, Reviews tab. One end to end assertion still fails (see Tests); everything else is green.
Built:

- Facts and team (M1, 5913fed, 0e3ed5c): seed/shop.ts, shared/schemas/shopSettings.ts (google), shared/lib/google.ts (Maps and review links), Visit page, JSON-LD, Iniya rules (src/pages/ChairPage.tsx, ChairsPage.tsx, booking), sitemap, test migration to the real keys
- Per barber prices (M2, fbed598; 3879c22): staff.servicePrices in shared/schemas/staff.ts, shared/lib/servicePricing.ts, availability quotes per chair, booking and reschedule, src/admin/team PriceOverrideEditor (Team, Prices), src/lib/menuPrices.ts
- Moves reprice (3879c22): server/services/scheduleChanges.ts (quoteMove), src/admin/panels/Resolver.tsx and moveOption.ts, the moved email
- Photos (M3, 65aa294): server/services/seedPhotos.ts, server/lib/webpSize.ts, scripts/photos-seed.ts, vercel.json includeFiles, hero scrim token, Home work, chair strips
- Reviews (M4, df13109): settings.reviews, PUT /api/admin/reviews, src/components/site (Stars, RatingLine, ReviewCard, ReviewList), src/admin/website/ReviewsPanel.tsx and ReviewsEditor.tsx
- Docs and copy (M5, fe51818), captures (e121c05, dad7bc8): tests/e2e/p12-capture.ts, docs/screens/p12/, owner guide screens and PDF recaptured with the real team
  Key decisions (full list D12-01 to D12-88 in docs/DECISIONS.md):
- Suite F over Squire's "Unit 4" until Dontrise says otherwise (D12-01). The personal text line appears nowhere public.
- First available shows the lowest total among chairs that do every chosen service, as "from"; a chosen chair is always exact (D12-*, Rob 6).
- A move reprices to the new chair and emails the customer; rejected keeping the old price (Rob 5).
- Reviews live on the settings document with one strict writer; no review text can be typed in (D12-56 to D12-66). No aggregateRating (D12-66).
- WebP sizes read from the file header, no new dependency (D12-41). Photos ship by vercel.json includeFiles (D12-47).
- Hero scrim 87% so the red-on-dark word reaches 4.5:1 (D12-80). Smaller photo copies deferred: Cloudinary before launch (Rob 1, D12-83).
- The sitemap skips chairs that take no online bookings, so Iniya is not listed; her page still works (superseded D12-11).
  Deviations:
- Photos came in three pushes (3 JPGs on main converted to WebP, then 13 WebP); the loader still skips missing files with one warning.
- The resolver Move now emails the customer and raises the manage link version (D11-08 had made moves silent).
- manualBookings.test.ts freezes Date at 13:00 shop time on the next Tuesday and books on the barber's next working day (D12-88).
- The milestone reviews were replaced by one final review at Rob's request.
  Data model:
- staff: new optional servicePrices [{serviceId, priceCents, durationMinutes?}] (no new index)
- shopSettings: new google {placeId, rating, reviewCount, ratingCheckedOn} and reviews {enabled, items[]} (no new index)
- photos: optional home flag; seeded ids from seedId('photo', file) (no new index)
- bookings: unchanged shape; stored lines, minutes and total are the assigned chair's, and a move rewrites them
- No new collections or indexes
  API contract:
- New: PUT /api/admin/reviews (owner)
- Changed: PUT /api/admin/staff/:id accepts servicePrices (owner); PUT /api/admin/settings no longer writes google or reviews (owner); GET /api/gallery?home=true (public); GET /api/shop serves google and only the shown reviews (public); GET /api/staff exposes servicePrices (public); /api/sitemap.xml skips chairs without online booking (public)
- Authz matrix: 102 routes by 4 roles
  Tests:
- Unit and integration: 85 files, 634 passed, 0 failed (npx vitest run, and npm run test:coverage in the gate)
- Coverage (whole repo): statements 96.64%, branches 88.82%, functions 98.07%, lines 96.64%
- End to end, full gate: dev 137 passed, 2 failed, 1 skipped; prod-like 7 passed; showcase 13 passed; test:vercel-function 97 passed
- After the test fixes (npx playwright test tests/e2e/team.spec.ts tests/e2e/site.spec.ts, run once): 12 passed, 1 failed
- Still failing: site.spec "an uncredited gallery photo opens in the lightbox with no barber line and no book link". The lightbox correctly shows no barber line, but it does show the shop-wide "Book a chair" link to /book, and the test asserts no link starting with "Book". The app is right; the assertion is too broad (open item)
- Commands: /tmp/gate.sh (build, typecheck, lint, format:check, test:coverage, the three Playwright suites, test:vercel-function); npx vitest run tests/integration/manualBookings.test.ts; npx vitest run
  Checks: typecheck clean, lint clean (max warnings 0), format clean, build clean (API bundle committed).
  Design checklist:
- PASS hero at 390: what, where and BOOK NOW without scrolling, next section peeking (docs/screens/p12/home-light-390-top.png, home-dark-390-top.png)
- PASS photos sized, cropped and alt texted, cards holding (home-light-390.png, gallery-light-390.png, gallery-light-1280.png, chair-drew-light-390.png)
- PASS type, spacing, radius, token colors and contrast: red-on-dark at the 87% scrim is 4.75:1 at 390 and 4.51:1 at 768, white text 13:1 or more (home-light-390-top.png)
- PASS every new button and input state and toast: kit.spec in the gate (admin-team-prices-light-1280.png, admin-website-reviews-light-1280.png)
- PASS no new motion, nothing hidden by fade-ins (home-light-390.png)
- PASS tap targets 44px, axe clean at 390 and 1280 in light and dark (rules.spec 17 of 17)
- FAIL Lighthouse mobile 85: Home 81, Gallery 74, Drew 93; CLS 0 and accessibility 100 everywhere. Cause: full-size photos from GridFS. Open per Rob: Cloudinary before launch, else smaller copies next prompt (docs/screens/p12/lighthouse.json)
- PASS no made-up numbers: "4.7 on Google from 15 reviews" comes from settings (home-light-390.png)
  Screenshots (docs/screens/p12/, light and dark, -top for first screens): home, gallery, services, chair-drew, chair-iniya, visit at 390 and 1280; admin-website-reviews, admin-website-photo, admin-website-gallery, admin-team-prices at 390 and 1280 (light); montage-light-390, montage-dark-390, montage-light-1280, montage-dark-1280. Owner guide screens: docs/screens/p11/guide/ (recaptured), docs/OWNER-GUIDE.pdf (rerendered).
  Commits:
- b856138 content: real shop data and photo manifest (Rob)
- 6deeed8 three real photos as WebP; a83d278 the other 13 (Rob); b25a294 drop the exq-15 duplicate
- 5913fed real shop facts, team and Iniya rules; 0e3ed5c review fixes for M1
- fbed598 per barber prices and times
- 65aa294 seed photos loaded and placed
- df13109 real reviews on Home, chair pages and Website
- fe51818 copy sweep and docs
- e121c05 captures and the hero text fix
- 3879c22 moves reprice, exact chair prices, hero scrim, review fixes, time independent manualBookings test
- dad7bc8 hero and owner guide screens recaptured, PDF rerendered
- 45e8357 Move and lightbox tests updated; 637c391 merge of main; ff9a80c the three loose JPGs removed from the repo root
  Env vars:
- SEED_PHOTOS_DIR: optional, points the photo loader at another folder (tests and captures); not needed in production
- No other new variables. Existing ones unchanged (STORAGE_DRIVER decides where seeded photos go)
  Open questions (for Dontrise):
- Values still marked PLACEHOLDER in seed/shop.ts: the shop email (hello@exquisitebarberbeauty.com, hidden on every public page), the website URL, buffer 10 minutes, lead time 60 minutes, booking window 30 days, cancel and reschedule cutoffs 120 minutes, owner alert email and owner login email (owner@exquisitebarberbeauty.com), reply-to email, chair numbers 1 to 5, Lee's menu (shop prices), Lee's bio, the working hours of Dontrise, Lee and Nelly (shop hours); on the Visit page, the parking and policies copy
- Permission to show the 18 reviews; two of Nelly's theCut reviews say "Mike" (his real name per the data file); he can hide them in Website, Reviews
- Suite F or Unit 4
  Known gaps and risks:
- site.spec uncredited lightbox assertion fails as described in Tests (one line to narrow the check to barber links)
- Lighthouse under 85 on Home and Gallery until photos are on Cloudinary
- No barber portraits yet, so chair cards show the no-photo state
- No storefront photo, so the Visit page has no photo slot (open item)
- The live showcase shows none of this until after the deploy and Settings, Demo data, Reset
  Needs Rob's phone and laptop:
- A real iPhone check of the hero and the gallery
- A real booking with Drew to confirm his override price in the confirmation email
- On the live showcase after deploy: Settings, Demo data, Reset, then open /api/health
  Ready for next step: merge this PR, deploy, run Demo data, Reset on the showcase. Next prompt starts with Cloudinary for photos (or resized copies if it slips) and must not change the pricing rule, the reviews writer or the seed photo ids.
