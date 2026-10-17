# Operations

How to run the site day to day. Companion to `docs/DEPLOY.md`.

## Backups and restore

- Every day at 13:00 UTC the cron route exports every business collection to
  the photo bucket under `_backups/YYYY-MM-DD/` as gzipped NDJSON files plus a
  `manifest.json`. Sessions, rate limit windows and idempotency keys are not
  included. Thirty days are kept.
- To check: Cloudflare R2, the bucket, open `_backups/`; there should be a folder
  for yesterday with one file per collection.
- To restore into a scratch database from a computer with the repo:
  1. Put the production variables in `.env` (MONGODB_URI, the R2 variables,
     STORAGE_DRIVER=r2, MANAGE_LINK_SECRET).
  2. `npm run restore -- --date=2026-10-17 --to=exquisite_restore`
  3. Point a local `npm run dev` at `MONGODB_DB_NAME=exquisite_restore` to look
     at the data, or copy single records back by hand.
  4. Restoring over the live database needs `--force` and replaces every
     collection whole. Put the site in maintenance mode first (below).

## Rotating a secret

Change the value in Vercel, redeploy, then:

- MANAGE_LINK_SECRET: every cancel or reschedule link in sent emails stops
  working; customers get "That link is not valid" and have to call. It also
  forgets the trusted sign-in addresses and invalidates upload tickets that
  were issued in the last five minutes. Rotate only after a leak.
- CRON_SECRET: nothing breaks; Vercel Cron reads the new value on the next run.
- BOOTSTRAP_SECRET: only needed while setup runs; delete it afterwards.
- RESEND_API_KEY: create the new key in Resend first, set it, redeploy, then
  delete the old key in Resend.
- R2 API token: create a new token in Cloudflare, set both R2 values, redeploy,
  delete the old token. Photos keep working (they are read through the public
  address, not the token).
- MONGODB_URI (database user password): change the password in Atlas Database
  Access, set the new string, redeploy. Requests fail for the seconds between.

## Resetting the owner password

- If you can sign in: Account, change password.
- If a barber is locked out: Settings, Logins, Reset password; give them the
  temporary password shown once.
- If the owner is locked out and nobody can sign in: from a computer with the
  repo and the production variables in `.env`, run
  `npm run user:reset -- --email owner@yourdomain.com`. It prints a temporary
  password, ends every session of that login and clears any lockout. Change the
  password right after signing in.
- A wrong-password lockout lasts 5 minutes the first time and grows; signing in
  from a phone or computer that signed in within the last 30 days bypasses it.

## Maintenance mode

1. Vercel, Settings, Environment Variables, add MAINTENANCE_MODE = `true`
   (Production), redeploy.
2. Every public page shows "Back in a moment" with the shop phone. The staff
   area, sign in and the health check keep working, so you can still take
   walk-ins and phone bookings in the dashboard.
3. Delete the variable and redeploy to open the site again.

## Reading logs

- Vercel, the project, Logs (or Deployments, the deployment, Functions).
- Every line is one JSON object. Useful fields: `requestId` (also sent to the
  browser in the X-Request-Id header and in every error body), `code`
  (CONFLICT, SLOT_TAKEN, RATE_LIMITED, CONFIG_ERROR, MAINTENANCE and so on),
  `status`, `path`, `ms`.
- Emails and phone numbers are masked in every log line (`j***@example.com`,
  `***00`). Passwords, tokens and secrets are never logged.
- Search for `"level":"error"` to see failures; each one is logged exactly once.

## If bookings stop

1. Open `/api/health`. `"status":"ok"` means the database answers. `degraded`
   means Atlas is unreachable: check Atlas (cluster paused? network access?).
2. Open `/setup` (re-add BOOTSTRAP_SECRET for a minute) or run `npm run doctor`
   and read the rows marked Fix.
3. Run the smoke test from GitHub Actions. A failed "Cross-site POST rejected"
   or "Security headers" line means vercel.json did not deploy; redeploy `main`.
4. Check the Email outbox in the dashboard for failed messages and press Retry.
5. Check Vercel Logs for `"code":"DATABASE_UNAVAILABLE"` or `"code":"INTERNAL_ERROR"`
   and send the `requestId` with any bug report.
6. If the site is wrong rather than down, switch maintenance mode on, fix, then
   switch it off.

## The daily job

`GET /api/internal/cron/daily` runs once a day (Vercel Hobby allows one). It
sends any emails the live path could not, removes deleted photos from the
bucket, sweeps abandoned uploads, writes the backup and prunes old ones. To run
it by hand: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<site>/api/internal/cron/daily`.
Vercel Pro allows more frequent schedules; edit `crons` in `vercel.json`.
