# Exquisite Barber & Beauty Lounge: project rules

This file is the source of truth for every task in this repository. Read it before
touching code. `docs/ARCHITECTURE.md` holds the detailed system design and the API
contract; this file holds the rules that never change.

## Client

- Exquisite Barber & Beauty Lounge, 3309 Edgmont Ave, Brookhaven PA.
- Owner: Dontrise (also cuts). Instagram @exquisitebarberbeauty. Tagline: Gifted Hands.
- Barbers and stylists under one roof: the owner plus 5 barbers.
- Shop timezone: America/New_York. Daylight saving time must be handled correctly.

## Scope

In scope (what the client is paying for):

- Public pages: home, services, the chairs (team) with one page per barber at
  `/chairs/:slug`, gallery, visit (hours, address, contact).
- Online booking: pick one or more services, pick a barber or "first available",
  pick a day and time, enter name, phone and optional email, confirm.
- Customers cancel or reschedule through a signed link in their confirmation.
  There are no customer accounts.
- Email confirmations to the customer and new-booking alerts to the owner.
- Owner dashboard: today's schedule, booking management, walk-ins, blocking time,
  toggling staff in or out for the day, editing services, staff, hours and settings.
- Barber logins that see only their own schedule.
- Mobile first, basic SEO, hosting on Vercel.

Out of scope for now (design for it, never build it until asked): card payments
for gift cards, a rewards punch card, text message reminders. The data model and
code structure must let these be added without a rewrite.

## Stack (use exactly this)

- TypeScript in strict mode everywhere (`tsconfig.base.json`).
- Vite + React + React Router with `BrowserRouter`. Real paths, never hash routes.
- Vercel serverless functions in `/api`. Handlers are thin. Business logic lives in
  `/server`. All API traffic goes through one catch-all function
  (`api/[...path].ts`) and the router in `server/http`.
- MongoDB with the official driver. The client is cached on `globalThis`.
  Multi-document writes use transactions through `withTransaction`.
- zod for every request, response and document schema, shared between client and
  server from `/shared`.
- Luxon for all date and time work. Shop timezone constant: `SHOP_TIMEZONE`.
- Vitest for unit and integration tests, using mongodb-memory-server as a replica
  set so transactions work. Playwright for end to end later.
- Icons only from `@untitled-ui/icons-react` with deep ESM imports
  (`@untitled-ui/icons-react/build/esm/<Name>`). `@babel/runtime` is pinned to `^7`
  as a direct dependency.
- Node LTS pinned in `.nvmrc` and `package.json` engines.

## Hard rules

1. No secrets in `VITE_` variables, ever. Anything secret is server side only.
2. Every write is validated with zod on the server. Never trust the client.
3. Double booking must be impossible at the database level: one `slotLocks`
   document per 15 minute block with a unique index on `(staffId, slotStart)`,
   inserted inside the same transaction as the booking.
4. Money is stored as integer cents. Times are stored as UTC `Date` values and
   converted to shop time only at the edges (API input parsing, rendering, email).
5. Staff and services are soft deleted (`deletedAt`), never hard deleted, because
   bookings reference them.
6. Each barber has a public slug used in URLs. Printed cards carry QR codes to
   `/book?barber=<slug>`, so a slug must keep working forever. Slug aliases are
   kept in `staff.slugAliases`; lookups check current slug and aliases.
7. Every booking gets a short reference code from an alphabet without 0, O, 1 or I.
8. No em dashes in any user-facing copy. No emoji anywhere, including code,
   commit messages and docs.
9. Every value we do not have yet (names, prices, hours, phone, email) lives in
   `seed/shop.ts` and is marked `// PLACEHOLDER`.
10. Routes never touch the MongoDB driver directly. They call repositories in
    `server/repos` or services in `server/services`.
11. Documents use string `_id` values (24 hex characters) so ids are identical in
    the database, the API and the client. Generate them with `newId()`.

## Conventions

- Folder layout and ownership: see `docs/ARCHITECTURE.md`, section "Folder structure".
- Path aliases `@shared/*`, `@server/*` and `@/*` are defined in `tsconfig.base.json`
  and used by Vite, Vitest and the web app. Code under `/api` and `/server` uses
  relative imports so the Vercel runtime never has to resolve aliases.
- Every React component has a unique class prefix (`exq-<component>`) and exposes
  its state through `data-state` attributes so a designer can restyle everything
  without touching logic. Markup is semantic. Only a minimal CSS reset exists until
  the design pass.
- Errors: throw `AppError` from `server/lib/errors.ts`; every route responds through
  the single error helper, in the one error format described in the architecture.
- Tests live in `/tests`: `tests/unit` for pure helpers, `tests/integration` for
  repositories and routes against mongodb-memory-server.
- Commit in logical steps with clear messages. Never include model identifiers in
  commits or code.
- Run `npm run typecheck && npm run lint && npm run test && npm run build` before
  declaring a task done.

## Reporting rule

Every task ends with a report written to `docs/reports/NN-<name>.md` and printed in
chat inside one code block, under 150 lines, in exactly this format:

```
REPORT NN: TITLE
Summary: (3 to 5 sentences on what exists now)
Built: (bulleted list of what was created, grouped by area, with file paths)
Key decisions: (each decision, the alternative rejected, and why)
Deviations: (anything done differently from the prompt, and why)
Data model: (each collection on one line with its indexes)
API contract: (route list with method and auth level)
Tests: (count passed and failed, coverage percentage per folder, the exact commands run)
Checks: (typecheck, lint and build results)
Commits: (hash and message for each)
Env vars: (each variable, what it is for, and whether it is needed now or later)
Open questions: (what is needed from the user or the client)
Known gaps and risks: (anything incomplete, fragile or worth a second look)
Ready for next step: (what the next prompt should start with, and what it must not change)
```
