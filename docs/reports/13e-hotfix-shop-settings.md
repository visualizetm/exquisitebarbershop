REPORT 13e-HOTFIX: /API/SHOP 500 ON SETTINGS SAVED BEFORE THE LAUNCH OFFER
Summary: After the 13e deploy (b47f552, production build 075013b), GET /api/shop returned 500 INTERNAL_ERROR on production, so every public page showed "Online booking is having a moment" with Error code INTERNAL_ERROR. The production shopSettings document was written before 13e and has no launchOffer group. shopSettingsRepo.fill() defaulted the older late groups (permissions, announcement, google, reviews, social, nextOpenServiceId) but not hero, visit or launchOffer, so launchOfferIsLive() read enabled off undefined. fill() now defaults all three, a regression test proves it, and the fix is on PR 20 with CI and the Vercel preview green. It is not merged yet: merging deploys to production and waits on Rob's go-ahead.

Built:

- Fix: server/repos/shopSettingsRepo.ts (fill() adds hero, visit and launchOffer from DEFAULT_HERO, DEFAULT_VISIT and DEFAULT_LAUNCH_OFFER, merged under any stored values)
- Test: tests/integration/shopSettingsRepo.test.ts ("fills hero, visit and launchOffer for a document written before they existed": unsets all three on the stored document, then requireShopSettings returns the defaults)
- Bundle: server/bundle/app.mjs rebuilt with npm run build:api
- Report: docs/reports/13e-hotfix-shop-settings.md

Key decisions:

- Default in the repo's fill() rather than a one-off database migration. Rejected: a $set on the production document. fill() is the existing pattern for groups added after setup, covers every environment (production, preview, any restored backup), and needs no database access from this session.
- Merge stored values over the defaults ({ ...DEFAULT, ...stored }). Rejected: stored ?? DEFAULT. The spread also covers a partly written group, matching announcement, google and reviews.
- Cover hero and visit too, not only launchOffer. They were added in 13d with the same gap; production only survived them because the 13d demo reset wrote them.

Deviations: Done as a direct hotfix in this session instead of a Claude Code prompt, because production was down. Integration tests could not run in this sandbox (mongodb-memory-server cannot download its binary here); the full suite ran in CI instead.

Data model: No schema or index change.

- shopSettings: unchanged schema; documents missing hero, visit or launchOffer now read with defaults (no index)
- bookings: unchanged (launchOfferOncePerPhone partial unique index from 13e untouched)

API contract: No route change. GET /api/shop (public) returns 200 again for settings documents written before 13d and 13e. GET /api/admin/settings (owner) and POST /api/bookings (public) read the same filled settings.

Tests:

- CI run 40546343379 (pull_request) and 40546310724 (push), both success: typecheck, lint, format:check, test:coverage (coverage thresholds in vitest.config pass), build, committed bundle up to date, Vercel function under plain node.
- Count: 13e reported 692 passed, 0 failed; this adds 1 test, so 693 expected. The exact count and the per-folder coverage table could not be read here (the CI log host is blocked from this sandbox).
- Local: npx vitest run tests/integration/shopSettingsRepo.test.ts could not start (MongoDB binary download refused by the sandbox network).
- Commands run: npm ci; npm run typecheck; npx eslint server/repos/shopSettingsRepo.ts tests/integration/shopSettingsRepo.test.ts; npx prettier --check (same two files); npm run build:api.

Checks: typecheck clean, lint clean on the changed files, format clean on the changed files, API bundle rebuilt (1562 KB, 269 source files), CI green, Vercel preview deployed.

Commits:

- branch claude/hotfix-shop-settings-defaults: "Hotfix: fill hero, visit and launchOffer for older settings documents"; this report as a follow-up commit
- PR 20, open, not merged

Env vars: none new.

Open questions:

- Rob: approve merging PR 20 to main (production deploy).
- Cloudinary is still not configured in production. The 13e report says production serves Cloudinary image widths; it does not until CLOUDINARY_* and STORAGE_DRIVER=cloudinary are set, so the hero is still the full size photo.

Known gaps and risks:

- Production is down until PR 20 merges and deploys. Running Demo data Reset may also restore it (the seed writes the new groups), but only the merge fixes it for good.
- Why 13e's tests missed it: every suite (unit, integration, dev, prod-like, showcase) starts from a fresh seed that already has launchOffer. Nothing tested a settings document saved by an older build. Any future settings group needs a fill() default and a test like this one.
- 13e follow-ups not in this hotfix: the owner's takings count the price, not the price after the discount; Lighthouse Home is 84; the flow's review step shows the offer label but not the subtraction.
- Vercel MCP returns 403 for runtime errors, logs and toolbar comments on this project, so production errors were found by calling /api/shop directly. The Vercel emails were the vercel[bot] preview comments on PRs 11 to 19, each with 0 feedback threads.

Ready for next step: Merge PR 20, confirm GET /api/shop is 200 and /api/health shows the merge commit as buildSha, then run Demo data Reset. The next prompt (13f) starts from main after the merge and covers the takings after discount, the Cloudinary widths once configured, and the subtraction on the review step. It must not change fill()'s defaults, the hours rule, the booking service lock order, the pricing rule, the discounts list shape, the launchOfferOncePerPhone index or the fit guard.
