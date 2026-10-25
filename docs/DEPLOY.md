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

Changing a variable does nothing until the next deployment: after every change
in this table, go to Deployments, the three dots on the latest one, Redeploy.

### Launch now, without Cloudflare R2

Photos and daily backups need an R2 bucket. The site runs without one: every
page shows its placeholder (initials for the chairs, the ink hero, no gallery),
the Photos screen says storage is not set up yet, and the daily job only sends
emails. Set these in Production and the site is complete and bookable.

| Name                 | Environments        | Required | What it is                                                                                                                |
| -------------------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| MONGODB_URI          | Production, Preview | required | The Atlas connection string: Atlas, Database, Connect, Drivers. Use a separate database user per environment if you like. |
| MONGODB_DB_NAME      | Production          | required | `exquisite_production`                                                                                                    |
| MONGODB_DB_NAME      | Preview             | required | `exquisite_preview` (must differ from production so previews never touch live bookings)                                   |
| APP_BASE_URL         | Production          | required | `https://` plus the final domain, no trailing slash (until the domain exists, the vercel.app address)                     |
| APP_BASE_URL         | Preview             | required | the preview address Vercel gives the branch, with `https://`                                                              |
| MANAGE_LINK_SECRET   | Production, Preview | required | secret 1                                                                                                                  |
| CRON_SECRET          | Production, Preview | required | secret 2                                                                                                                  |
| STORAGE_DRIVER       | Production, Preview | required | `none` until photos are set up, then `cloudinary` (section 10b) or `r2` (section 10)                                      |
| STORAGE_DISABLED_ACK | Production          | optional | `true` while STORAGE_DRIVER is `none`. It says "no photos and no backups, on purpose". Remove it once R2 is on.           |
| EMAIL_PROVIDER       | Production, Preview | optional | `log` until Resend is verified (section 8), then `resend` in Production                                                   |
| EMAIL_DISABLED_ACK   | Production          | optional | `true` while EMAIL_PROVIDER is `log`. Remove it once email is on.                                                         |
| BOOTSTRAP_SECRET     | Production          | optional | secret 3, only while setup runs. Remove it after section 5.                                                               |
| SEED_OWNER_EMAIL     | Production          | optional | the owner's login email, only while setup runs                                                                            |
| SEED_OWNER_PASSWORD  | Production          | optional | secret 4, only while setup runs. Remove it after section 5.                                                               |

Without a required variable the site shows "Online booking is having a moment"
on every page, and `https://<your site>/api/health` answers
`{ "ok": false, "missing": ["NAME", ...] }` with the names to set (never the
values). Without the acknowledgement for a feature that is off, the same thing
happens and the health check names the acknowledgement.

### Later: photos and backups (Cloudflare R2)

| Name                 | Environments        | What it is                                                                                              |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| STORAGE_DRIVER       | Production, Preview | `r2`                                                                                                    |
| R2_ACCOUNT_ID        | Production, Preview | Cloudflare dashboard, R2, the account id shown on the right                                             |
| R2_ACCESS_KEY_ID     | Production, Preview | Cloudflare R2, Manage R2 API Tokens, create a token with Object Read and Write on the bucket            |
| R2_SECRET_ACCESS_KEY | Production, Preview | the secret shown once with that token                                                                   |
| R2_BUCKET            | Production, Preview | the bucket name                                                                                         |
| R2_PUBLIC_BASE_URL   | Production, Preview | the bucket's public address: R2, the bucket, Settings, Public access (custom domain or the r2.dev link) |
| R2_KEY_PREFIX        | Preview             | `preview/` so preview uploads sit in their own folder                                                   |

### Later: email (Resend)

| Name           | Environments | What it is                                                                                      |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| RESEND_API_KEY | Production   | from Resend, API Keys (section 8)                                                               |
| EMAIL_FROM     | Production   | `Exquisite Barber & Beauty Lounge <bookings@yourdomain.com>` on the verified domain (section 8) |

Vercel fills in VERCEL_ENV, VERCEL_URL and VERCEL_GIT_COMMIT_SHA on its own.

## 3. Atlas

1. Atlas, Network Access, Add IP Address, Allow access from anywhere
   (0.0.0.0/0). Vercel has no fixed address.
2. Atlas, Database Access: a user with read and write on the database; its
   password goes inside MONGODB_URI.

## 4. Deploy

Production only ever deploys from `main`; branches get preview deployments.

1. Merge the open pull request into `main` once its CI check is green. Vercel
   builds `main` and deploys it to Production.
2. If the variables were added after that build, redeploy: Deployments, the
   three dots on the latest deployment, Redeploy. A deployment reads the
   variables once, at build time, so every change needs a new one.

3. **Open `https://<your site>/api/health`. It must answer JSON, never a Vercel error
   page.** Healthy is `{"ok":true,...}`. If a setting is missing it is
   `{"ok":false,"status":"config","missing":["NAME", ...]}` (names only): set those and redeploy.
   A page that is not JSON means the function itself is broken; see section 12.
   Do this after every deploy.

Until setup has run (next step), the pages show "Online booking is having a
moment" and `/api/health` reports what is missing. That is expected.

## 5. Run setup from the browser

1. Open `https://<your site>/setup`. It loads even while the rest of the site
   says it is having a moment.
2. Paste BOOTSTRAP_SECRET into the field.
3. Press Run doctor. On a fresh database three rows read Fix: Indexes, Shop
   data and Owner login. Setup creates all three. Photo storage, Public photo
   URL, Backups and Email read Check while R2 and Resend are not set up; that
   is fine for launch. Any other Fix row names the variable and says what to do;
   fix it in Vercel, redeploy and run the doctor again.
4. Press Run setup. It creates the database indexes, loads the services, chairs,
   hours and settings, and creates the owner login from SEED_OWNER_EMAIL and
   SEED_OWNER_PASSWORD. It runs once; a second press answers "Setup already
   ran" unless you tick the box to force it.
5. Press Run doctor again: no Fix rows.
6. In Vercel, delete SEED_OWNER_PASSWORD and BOOTSTRAP_SECRET, then redeploy.
   The /setup page now answers 404.

## 6. Sign in and check

1. Open `https://<your site>/admin`, sign in with the owner email and the
   password from step 1, then change the password under Account.
2. Run the doctor once more from a terminal if you have one (`npm run doctor`
   with the production variables in `.env`), or re-add BOOTSTRAP_SECRET for a
   minute and use /setup. No row should read Fix.
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
   redeploy (variables only take effect on a new deployment).
4. Run the doctor: the Email row reads "Resend is set up and the sender domain
   is verified." Make a test booking with your own email and check the inbox.

## 9. Launch checklist

- [ ] Doctor: no Fix rows (Photo storage, Public photo URL, Backups and Email
      read Check until sections 8 and 10 are done)
- [ ] Smoke test: every line PASS
- [ ] Owner password changed under Account
- [ ] SEED_OWNER_PASSWORD and BOOTSTRAP_SECRET removed from Vercel
- [ ] Hours, services and prices checked under Settings
- [ ] Each chair's name and specialty checked under Settings
- [ ] Real phone, address and Instagram under Settings
- [ ] A test booking made, moved and cancelled through the manage link (from
      the Email outbox screen while email is off)
- [ ] Once R2 is on (section 10): portraits and a hero photo under Photos, and
      the first backup in the bucket under `_backups/` the morning after

## 10. Switch photos and backups on later (Cloudflare R2)

Nothing in the data changes; only variables do. Bookings keep working throughout.

1. Cloudflare, R2, Create bucket (any name, for example `exquisite-photos`).
2. The bucket, Settings, Public access: connect a custom domain (for example
   `photos.yourdomain.com`) or enable the r2.dev address. That address is
   R2_PUBLIC_BASE_URL.
3. R2, Manage R2 API Tokens, Create API token with Object Read and Write on
   that bucket. Note the Access Key ID and the Secret Access Key (shown once).
4. In Vercel set the R2 rows from the table in section 2 (Production and
   Preview), set STORAGE_DRIVER to `r2`, and delete STORAGE_DISABLED_ACK.
5. Redeploy.
6. Run the doctor (re-add BOOTSTRAP_SECRET for a minute and use /setup, or
   `npm run doctor` with the production variables in `.env`): Photo storage,
   Public photo URL and Backups read OK.
7. Admin, Photos: upload a portrait per chair, a hero photo and some gallery
   work. The pages pick them up at once; the first backup is written the next
   morning at 13:00 UTC.

Photos kept in MongoDB by the showcase (STORAGE_DRIVER=mongo) are not copied to
R2; see section 11.

To switch R2 off again, set STORAGE_DRIVER back to `none` with
STORAGE_DISABLED_ACK=true and redeploy. Photos already in the bucket stay there
and are hidden until the driver is `r2` again.

## 10b. Photos on Cloudinary (the way photos are meant to run)

Cloudinary replaces R2 and the showcase's GridFS for photos. Uploads go straight from the browser to
Cloudinary with a signature this server makes; the API secret never reaches the browser. Pictures
are delivered from `res.cloudinary.com` in four widths (400, 800, 1200, 1600), cropped to the frame
they sit in, in the best format for the visitor's browser.

### The variables

| Variable              | Environments        | Value                                                                              |
| --------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| STORAGE_DRIVER        | Production, Preview | `cloudinary`                                                                       |
| CLOUDINARY_CLOUD_NAME | Production, Preview | Cloudinary dashboard, the cloud name at the top of Settings                        |
| CLOUDINARY_API_KEY    | Production, Preview | Settings, API Keys                                                                 |
| CLOUDINARY_API_SECRET | Production, Preview | the secret next to that key (server side only, never a `VITE_` variable)           |
| CLOUDINARY_FOLDER     | Production          | `exquisite/production`                                                             |
| CLOUDINARY_FOLDER     | Preview             | `exquisite/preview` (the app refuses a Preview folder that does not say `preview`) |

Preview always uses its own folder, so a test upload on a preview deployment never lands among live
photos and the daily sweep of one folder never touches the other. The same cloud serves both.

### Switching on

1. In Vercel set the rows above in Production and Preview. Set STORAGE_DRIVER to `cloudinary`.
   Delete STORAGE_DISABLED_ACK if it is there.
2. Redeploy (the top row of Deployments for main). A site with `cloudinary` selected and a missing
   value refuses to serve and `/api/health` names the variable; it never prints a value.
3. Open `/api/health`: `ok` is true.
4. Admin, Photos: upload one photo. It shows on the page at once.
5. Doctor (`npm run doctor` with the production variables in `.env`, or /setup): Photo storage reads OK
   after a signed ping to the Cloudinary Admin API. Backups read Check: Cloudinary holds photos only,
   so the daily job writes no export. Turn on MongoDB Atlas backups (Atlas, the cluster, Backup).

### What the server does

- Signs `{timestamp, folder, public_id}` for an owner session, or for a barber uploading their own
  portrait while the owner allows it. Nobody else can get a signature.
- After the browser upload it asks the Cloudinary Admin API whether the asset exists, with the size
  and version the browser reported, before the photo is saved. A mismatch destroys the asset.
- Removing a photo destroys the Cloudinary asset (the daily job does it, with the other clean up).
- The daily job also sweeps assets in the folder that are over 24 hours old and that no photo record
  points at (an upload that was never confirmed).
- Limits: images only, 10 MB per file after the browser's resize to 2000px.
- The site's content security policy allows `res.cloudinary.com` for images and `api.cloudinary.com`
  for the upload, and nothing else.

### Moving the showcase photos over

With the production variables in `.env` (including the four CLOUDINARY values):

```
npm run photos:migrate -- --from mongo --to cloudinary --dry-run
npm run photos:migrate -- --from mongo --to cloudinary
```

The dry run lists what it would copy and writes nothing. The real run copies each photo to
`<CLOUDINARY_FOLDER>/<its id>` and rewrites its record; run it again any time, a finished photo is
skipped and a half finished one is adopted. The GridFS copies are left in place; delete them when the
site looks right. `--from local` does the same for photos on a developer's disk.

## 11. Showcase demo (for showing the site to the client)

A fresh deployment that works with nothing but a database: no setup page, no
Cloudflare, no Resend. The first visit loads the shop, the chairs, the services
and some sample bookings by itself, the admin has a one-click demo sign-in, and
photos are uploaded straight into the database. Every page tells search engines
not to index it. Never use it for a real shop.

### The Vercel variables (Production)

| Name               | Value                                              | Notes                                                                      |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------------------------- |
| MONGODB_URI        | your Atlas connection string                       | required                                                                   |
| MONGODB_DB_NAME    | `exquisite_demo` (any name except `exquisite`)     | required; use a name of its own so real data never mixes in                |
| APP_BASE_URL       | `https://exquisitebarbershop.visualizeclients.com` | required, https, no trailing slash                                         |
| MANAGE_LINK_SECRET | your 32+ character secret                          | required                                                                   |
| CRON_SECRET        | your 32+ character secret                          | required                                                                   |
| DEMO_MODE          | `true`                                             | turns the showcase on                                                      |
| STORAGE_DRIVER     | `mongo`                                            | photos in MongoDB (GridFS), allowed in production only with DEMO_MODE=true |

Nothing else is needed. Email stays off (`EMAIL_PROVIDER` defaults to `log`),
and demo mode waives EMAIL_DISABLED_ACK and STORAGE_DISABLED_ACK, so you can
leave them set or delete them. BOOTSTRAP_SECRET, SEED_OWNER_EMAIL and
SEED_OWNER_PASSWORD are not needed; if you do set SEED_OWNER_PASSWORD the
owner login also works with the email and that password.

### Steps

1. Merge the pull request into `main`.
2. Set the variables above, then redeploy (Deployments, the three dots, Redeploy).
   DEMO_MODE must be set before that build: the build puts `noindex` into the
   page and a closed `robots.txt` into the site when it sees DEMO_MODE=true.
3. Open the site. The first visit takes a few seconds longer: it sets itself up.
4. `/admin` has a **Enter demo dashboard** button. Settings, Demo data, **Reset
   demo data** starts over from the sample shop at any time.

What the demo does differently: after a booking, the confirmation screen shows
the manage link on screen (no email is sent); the daily backup is skipped
(photos and data live in the same database); photos are limited to 3 MB after
the browser resize and are served by the site itself.

### Leaving the showcase for a real launch

The demo database holds sample data, a demo owner and the demo photos. Do not
reuse it. Either point MONGODB_DB_NAME at a new, empty database and follow
sections 2 to 6, or clear this one:

1. Set DEMO_MODE to `false` (or delete it). Set STORAGE_DRIVER to `r2` with the
   R2 variables (section 10) or to `none` with STORAGE_DISABLED_ACK=true. Add
   BOOTSTRAP_SECRET, SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD (the real owner), and
   the email choice (section 8, or EMAIL_DISABLED_ACK=true). Redeploy.
2. Open `/setup`, paste BOOTSTRAP_SECRET. Tick "I understand this deletes the
   whole demo shop" and press **Clear demo data**. It removes every booking,
   photo, login and setting, and works only on a database the demo filled.
   (From a computer with the production variables in `.env`: `npm run demo:clear`.)
3. Press **Run setup** (it creates the real owner from SEED_OWNER_*), then **Run
   doctor**. Until step 2 is done, Run setup answers "This database still holds
   demo data".
4. Delete SEED_OWNER_PASSWORD and BOOTSTRAP_SECRET, redeploy, sign in, change
   the password, and fill in the real phone, address, hours and prices.

Photos stored in GridFS do not move to R2 by themselves: switching
STORAGE_DRIVER only changes where new photos go, and clearing the demo data
removes the old ones. Upload the real photos again once R2 is on.

## 12. How the function is built, and how it is checked

Vercel runs the API with plain Node ESM, which cannot resolve imports written without
a file extension. So nothing under `server/` ships as separate files:

- `server/vercel-entry.ts` is the real function body. `npm run build:api` (also run by
  `npm run build`) bundles it with esbuild into one file, `server/bundle/app.mjs`, which is
  committed. `mongodb` and `@node-rs/argon2` stay external (native code); Vercel packs them
  from node_modules.
- `api/index.js` is the function Vercel sees: plain JavaScript that loads the bundle. If the bundle
  cannot load, it answers JSON `FUNCTION_LOAD_FAILED` instead of Vercel's error page.
- `vercel.json` rewrites `/api/(.*)` to the function (Vercel's own routing sends only one-segment
  paths to a catch-all file), rewrites everything else to `index.html`, and includes the bundle
  in the function.
- After changing anything in `server/`, `shared/` or `seed/`, run `npm run build:api` and commit
  `server/bundle/app.mjs`. CI rebuilds it and fails if the committed copy differs.
- `npm run test:vercel-function` runs the function under plain `node` from a directory holding
  only what Vercel would ship (the traced files, and the output of `vercel build`), calls
  `/api/health`, the demo flow and the upload path, and replays Vercel's routing table. It is a
  required CI step. If it fails, the site would have been down.
