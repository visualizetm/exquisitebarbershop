CORRECTION (prompt 9): the API never ran on Vercel until prompt 9 (ERR_MODULE_NOT_FOUND on an extensionless import), so statements here about production behavior (the env gate, setup, health, demo mode, a root cause of the down screen) were never observed there; they were checked under tsx, Vite or a local build. See docs/reports/09-vercel-function.md.
REPORT 07: LIVE WITHOUT R2, VISIBLE FAILURES, THREE UI FIXES
Commits (2026-10-17): a3cb1e2 code and tests; 3d3fced docs and captures. PR: https://github.com/visualizetm/exquisitebarbershop/pull/2 into main, CI green on 3d3fced.
1 Storage: STORAGE_DRIVER=none, allowed in production only with STORAGE_DISABLED_ACK=true. Upload routes 503 STORAGE_DISABLED; photo reads empty so pages show placeholders; Photos screen one empty state; daily cron runs the outbox only; doctor warns Photo storage, Public photo URL and Backups with the R2 fix.
2 Visible failure: /api/health answers 503 { ok:false, status:"config", missing:[names] } while the gate refuses, also with MONGODB_URI missing; /setup loads in that state; missing shop settings is 503 CONFIG_ERROR.
3 UI: nav wordmark from 1024px and stacked below, admin stacked; API-down body "Call the shop and we'll get you in."; route changes focus the H1 without a ring; sign-in page no longer logs a 401.
4 Verify: npm run test:e2e:prod serves the production bundle over https with the launch variables, plus a twin without MONGODB_URI. docs/screens/p7/montage.png.
5 Docs: DEPLOY.md launch table, order of clicks and the R2-later section; DECISIONS D7-01 to D7-15.
Tests: Vitest 330 passed in 50 files; Playwright 20 dev + 5 production-like passed.
