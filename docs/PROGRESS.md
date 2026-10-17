# Progress

One block per milestone, newest at the bottom. Each names what shipped, the
commit, and what is still open.

## Prompt 4

### Milestone 1: living docs, tokens, fonts, kit

- Shipped: `docs/SITE-REPORT.md`, `docs/DESIGN-SYSTEM.md`, this file and
  `docs/DECISIONS.md`; `src/styles/tokens.css`, `base.css`, `kit.css`; Jost
  self-hosted; the kit in `src/components/ui` (Button, Input, Select, Textarea,
  Chip, Card, Sheet, Toast, EmptyState, ErrorState, Nav, Footer, StepBar,
  StickyCTA, PhotoArch, ChairCard, TimeChip, Ticket, Lightbox); placeholder
  brand marks in `public/brand/`; the dev-only `/kit` page; the screenshot
  script. The public layout now uses the kit Nav and Footer.
- Screens: `docs/screens/m1/` (kit and home at 390 and 1280, plus montages).
- Open: every page still has its prompt 1 to 3 markup; the design pass on them
  is milestones 3 and 4.

### Milestone 2: storage, photos, next opening

- Shipped: the storage port with `r2` (aws4fetch) and `local` drivers; the
  `photos` collection with its two indexes; upload-url, confirm, list, PATCH and
  DELETE for photos with owner and barber scopes; purge in the daily cron;
  staff photos on `/api/staff`, the hero on `/api/shop`, `GET /api/gallery`;
  `GET /api/availability/next`, `GET /api/staff/:slug/openings`, `count` on
  the days endpoint; `/book` lands on details for a time from a link and steps
  back with a notice when it is gone. New settings: `permissions.barbersCanUploadPhotos`
  and `nextOpenServiceId`.
- Tests: photos (limits, server keys, confirm mismatches, signed PUT, local
  driver end to end, gallery paging, barber scope), next opening (status, owner
  service, off and closed days, openings, days count), a unit test for the
  label, and the authorization matrix at 71 routes x 4 roles.
- Open: the Photos screen and the browser-side resize to WebP are milestone 4.
