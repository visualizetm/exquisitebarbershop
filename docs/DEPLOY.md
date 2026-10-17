# Deploy: from the branch to a live site

Written for Rob. Every step is a click or a paste; no code and no terminal are
needed. Secrets are never written anywhere but Vercel.

## 1. Generate the secrets

You need four random strings of at least 32 characters. Make each one at a
password generator (1Password, Bitwarden, or any "random string" generator set
to 40 characters, letters and digits). Keep them in your password manager under
these names:

1. MANAGE_LINK_SECRET
2. CRON_SECRET
3. BOOTSTRAP_SECRET
4. SEED_OWNER_PASSWORD (at least 12 characters, no common words, not your email)

## 2. Vercel environment variables

In Vercel open the project, then Settings, then Environment Variables. Add each
row below. The Environments column says which boxes to tick (Production,
Preview, or both). Values are never written here.

| Name                 | Environments        | What it is                                                                                                                |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| MONGODB_URI          | Production, Preview | The Atlas connection string: Atlas, Database, Connect, Drivers. Use a separate database user per environment if you like. |
| MONGODB_DB_NAME      | Production          | `exquisite_production`                                                                                                    |
| MONGODB_DB_NAME      | Preview             | `exquisite_preview` (must differ from production so previews never touch live bookings)                                   |
| APP_BASE_URL         | Production          | `https://` plus the final domain, no trailing slash (until the domain exists, the vercel.app address)                     |
| APP_BASE_URL         | Preview             | the preview address Vercel gives the branch, with `https://`                                                              |
| MANAGE_LINK_SECRET   | Production, Preview | secret 1                                                                                                                  |
| CRON_SECRET          | Production, Preview | secret 2                                                                                                                  |
| BOOTSTRAP_SECRET     | Production          | secret 3. Remove it after setup has run (step 5).                                                                         |
| SEED_OWNER_EMAIL     | Production          | the owner's login email                                                                                                   |
| SEED_OWNER_PASSWORD  | Production          | secret 4. Remove it after setup has run (step 5).                                                                         |
| STORAGE_DRIVER       | Production, Preview | `r2`                                                                                                                      |
| R2_ACCOUNT_ID        | Production, Preview | Cloudflare dashboard, R2, the account id shown on the right                                                               |
| R2_ACCESS_KEY_ID     | Production, Preview | Cloudflare R2, Manage R2 API Tokens, create a token with Object Read and Write on the bucket                              |
| R2_SECRET_ACCESS_KEY | Production, Preview | the secret shown once with that token                                                                                     |
| R2_BUCKET            | Production, Preview | the bucket name                                                                                                           |
| R2_PUBLIC_BASE_URL   | Production, Preview | the bucket's public address: R2, the bucket, Settings, Public access (custom domain or the r2.dev link)                   |
| R2_KEY_PREFIX        | Preview             | `preview/` so preview uploads sit in their own folder                                                                     |
| EMAIL_PROVIDER       | Production, Preview | `log` until Resend is verified (step 8), then `resend` in Production                                                      |
| EMAIL_DISABLED_ACK   | Production          | `true` while EMAIL_PROVIDER is `log`. Remove it once email is on.                                                         |
| RESEND_API_KEY       | Production          | from Resend, API Keys (step 8)                                                                                            |
| EMAIL_FROM           | Production          | `Exquisite Barber & Beauty Lounge <bookings@yourdomain.com>` on the verified domain (step 8)                              |

Vercel fills in VERCEL_ENV, VERCEL_URL and VERCEL_GIT_COMMIT_SHA on its own.

## 3. Atlas

1. Atlas, Network Access, Add IP Address, Allow access from anywhere
   (0.0.0.0/0). Vercel has no fixed address.
2. Atlas, Database Access: a user with read and write on the database; its
   password goes inside MONGODB_URI.

## 4. Merge the pull request

1. Open the pull request from `claude/practical-maxwell-t6zzzk` into `main`.
2. Wait for the CI check to be green.
3. Press Merge. Vercel builds `main` and deploys it to Production. Production
   only ever deploys from `main`; branches get preview deployments.

Until setup has run (next step), every page shows "The site is not set up yet"
and the health check reports what is wrong. That is expected.

## 5. Run setup from the browser

1. Open `https://<your site>/setup`.
2. Paste BOOTSTRAP_SECRET into the field.
3. Press Run doctor. Every row should read OK or Check. A row marked Fix names
   the variable and says what to do; fix it in Vercel, redeploy (Deployments,
   the three dots, Redeploy) and run the doctor again.
4. Press Run setup. It creates the database indexes, loads the services, chairs,
   hours and settings, and creates the owner login from SEED_OWNER_EMAIL and
   SEED_OWNER_PASSWORD. It runs once; a second press answers "Setup already
   ran" unless you tick the box to force it.
5. In Vercel, delete SEED_OWNER_PASSWORD and BOOTSTRAP_SECRET, then redeploy.
   The /setup page now answers 404.

## 6. Sign in and check

1. Open `https://<your site>/admin`, sign in with the owner email and the
   password from step 1, then change the password under Account.
2. Run the doctor once more from a terminal if you have one (`npm run doctor`
   with the production variables in `.env`), or re-add BOOTSTRAP_SECRET for a
   minute and use /setup. Everything should read OK.
3. Run the smoke test: GitHub, Actions, Smoke test, Run workflow, paste the
   site address. Every line should read PASS.

## 7. Add the domain

1. Vercel, Settings, Domains, Add, type the domain, follow the DNS records it
   shows at your registrar.
2. When Vercel shows the domain as valid, set APP_BASE_URL (Production) to
   `https://` plus the domain and redeploy. Links in emails, the sitemap and
   the social card use it.

## 8. Verify Resend

1. resend.com, Domains, Add Domain, the sending domain (the site domain or a
   subdomain such as `mail.`), add the DNS records shown, wait for Verified.
2. API Keys, Create, copy it into RESEND_API_KEY (Production).
3. Set EMAIL_FROM, set EMAIL_PROVIDER to `resend`, delete EMAIL_DISABLED_ACK,
   redeploy.
4. Run the doctor: the Email row reads "Resend is set up and the sender domain
   is verified." Make a test booking with your own email and check the inbox.

## 9. Launch checklist

- [ ] Doctor: every row OK (Email may read Check until step 8 is done)
- [ ] Smoke test: every line PASS
- [ ] Owner password changed under Account
- [ ] SEED_OWNER_PASSWORD and BOOTSTRAP_SECRET removed from Vercel
- [ ] Hours, services and prices checked under Settings
- [ ] Each chair's name, specialty and portrait checked under Photos and Settings
- [ ] A hero photo uploaded under Photos
- [ ] Real phone, address and Instagram under Settings
- [ ] A test booking made, moved and cancelled through the email link
- [ ] The first backup appeared in the R2 bucket under `_backups/` the morning after launch
