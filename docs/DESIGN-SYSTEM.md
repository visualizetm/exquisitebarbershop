# Design system

The source of truth for how the site and the dashboard look: direction "Shop Sign" (bold,
editorial, black and white with red as the accent). The brief and page plan are in
`docs/brand/DESIGN-DIRECTION-V2.md`. Tokens live in `src/styles/tokens.css` (the one CSS
variables file); global type and layout in `base.css`; components in `kit.css`; the page frame in
`frame.css`; everything that moves in `motion.css`. Every component is seen in every state, in both
themes, on `/kit` (development builds only; the production build contains no kit chunk).

## Tokens

| Group   | Tokens                                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ink     | `--ink` #111111, `--ink-2` #1F1F1F, `--ink-3` #333333, `--text-2` #4A4A4A, `--text-3` #6B6B6B, `--line` #D9D9D9, `--surface-2` #F4F4F4, `--paper` #FFFFFF, `--mute-on-dark` #A8A8A8 |
| Red     | `--red` #C8102E, `--red-600` #A80D27, `--red-on-dark` #FF5470, `--red-50` #FDF2F4                                                                                                   |
| Meaning | `--ok` #1E7A46, `--warn` #9A6700, `--info` #1F5FAD (lighter in dark)                                                                                                                |
| Type    | `--font` Jost Variable; `--t-label` 13, `--t-body` 17 (18), `--t-h3` 22 (26), `--t-h2` 36 (56), `--t-display` 52 (96), `--t-price` 22; the value in brackets applies from 1024px    |
| Space   | `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32, `--s7` 48, `--s8` 64, `--s9` 96; `--hit` 44; `--rule` 2; `--wrap` 1200                                              |
| Shape   | `--r-card` 4 (cards, inputs, photos), `--r-pill` (buttons, chips); the phone bottom bar is square                                                                                   |
| Motion  | `--ease-out`, `--ease-in`, `--d-fast` 150ms, `--d-base` 250ms, `--d-slow` 400ms, `--stagger` 60ms                                                                                   |
| Shadow  | `--shadow-pop` (hover lift, toasts, popovers)                                                                                                                                       |

`--t-display` is `clamp(40px, 13.4vw, 52px)` on phones: exactly 52px from 385px wide, a little
smaller below so EXQUISITE never clips on a 360px screen.

Semantic surfaces (also in tokens.css) derive from the palette: `--bg`, `--card`, `--card-2`,
`--border`, `--fg`, `--fg-2`, `--fg-3`, `--accent` (red fills), `--accent-hover`, `--accent-text`
(red text: #C8102E on paper, #FF5470 on ink), `--accent-soft`, `--on-accent`, `--solid-bg` and
`--solid-fg` (the "ink" button and the selected card: ink in light, paper in dark), `--solid-fg-2`,
`--band-line`, `--scrim`. `.exq-dark` scopes an ink band inside any page; it stays ink in both
themes. `--scrim-photo` (ink at 80%) sits between a photo and the text on it, the Home hero on
phones and tablets: even over a pure white photo, white text keeps 10.2:1, `--line` 7.2:1 and the
red display line 3.3:1 (large text); small red labels on a photo turn white. The hero sets its own text
color (`color: var(--fg)`), so the title and facts follow the band, never the page around it. Measured on the
shop's real hero photo, the red line is 3.99:1 at 390 (D12-80).

The Home hero has two states. `data-state="text"`: no photo, the text stands alone on the page.
`data-state="photo"`: an ink band (`.exq-dark`); below 1024px the photo fills the hero behind the
text under `--scrim-photo`, cropped toward the upper right (`object-position: 85% 30%`, where the
faces are in the shop's hero photo); from 1024px it sits in its own 4:5 column with no scrim. The
photo is the LCP image (eager, `fetchpriority="high"`, width and height set, no reveal). Gallery
tiles crop square toward the upper middle (`object-position: 50% 35%`). A "work" grid of exactly
three photos is one row of three at every width.

## Themes

System (default), Light and Dark everywhere. The choice is stored under `exq-theme` and applied as
`data-theme="light|dark"` on `<html>`; with none, `prefers-color-scheme` decides. An inline script in
`index.html` applies it before first paint (its sha256 is in the CSP, checked by
`tests/unit/csp.test.ts`). The dark rules are scoped to `[data-theme='dark']` and to the media query,
so any element can carry `data-theme` (the kit page shows both side by side).

Dark values: background #111, cards #1F1F1F, borders #333, red text #FF5470, selected cards and the
primary button invert to paper. Marks swap by CSS (`Mark` renders both files); in an ink band the
white mark always shows.

## Type

- Jost Variable (`@fontsource-variable/jost`, self-hosted, one latin file preloaded,
  `font-display: swap`), weights 400 to 900.
- Label 600 caps +14% tracking, red. Body 400, line height 1.55. h3 700. h2 800 caps, line height 1,
  -1.5%. Display 900 caps, line height .95, -2%. Price 700, tabular numerals.
- Public pages use these six sizes and no others; the admin uses 13 to 22px. Button text is label
  size. `tests/unit/motionCss.test.ts` fails if a kit stylesheet names another font size or a literal
  color.

## Kit

| Component                                          | Props                                                                                          | States (data-state)                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Button, ButtonLink, ButtonAnchor                   | variant primary, accent, outline, ghost, onink; size sm, md, lg; block; icon; loading; pressed | default, hover (CSS), pressed, disabled, loading        |
| Input, Select, Textarea                            | label, hint, error, warning, native attributes                                                 | default, focus (CSS), error, warning, disabled          |
| Chip, ChipLink, Chips                              | selected, count, sub, tone; Chips scroll                                                       | default, selected, disabled                             |
| Card                                               | pad none, md, lg; interactive                                                                  | static, interactive                                     |
| OptionCard                                         | kind checkbox, radio, button; selected, disabled, title, description, meta, lead               | default, hover, selected (ink, red underline), disabled |
| Label, SectionHead                                 | label, title, level, aside                                                                     |                                                         |
| PriceRow                                           | name, description, price, meta, to                                                             | row, link                                               |
| PhotoFrame                                         | photo, name, ratio 4:5, 1:1, 16:9; sizes; priority                                             | loading, loaded, placeholder                            |
| ChairCard, ChairCardSkeleton                       | name, specialty, chairNumber, photo, status, statusLabel, to, href, selected                   | next-open, in, off, closed, none, selected, loading     |
| TimeChip, TimeChipLink                             | label, sub, selected, disabled, startAt                                                        | default, selected, disabled                             |
| StepBar                                            | steps, current, onJump                                                                         | per step: done (red), current (ink), todo (gray)        |
| Ticket                                             | code, heading, rows, total, actions, state                                                     | confirmed (check draws), cancelled, completed           |
| Toast (ToastProvider, useToast)                    | text, tone, action, duration                                                                   | neutral, ok, warn, danger                               |
| EmptyState, ErrorState                             | title, children, action                                                                        | empty, error                                            |
| Sheet, Modal, Lightbox (Dialog)                    | open, title, size, onClose                                                                     | open, closed                                            |
| Reveal, Lines                                      | kind rise or wipe; lines, mode load or scroll                                                  | data-reveal hidden, shown                               |
| TopStrip, Header, MobileMenu                       | announcement; phone                                                                            | open, closed                                            |
| BottomBar (BarView, useBar)                        | per page through `useBar`                                                                      | shown, hidden (keyboard)                                |
| Footer                                             | shop                                                                                           | loading, ready                                          |
| ThemeMenu, ThemeSwitch, Mark, DemoBanner, SiteDown | as before                                                                                      |                                                         |
| PriceOverrideEditor (`src/admin/team`)             | staffName, services (the barber's menu), saved, onSave, onChooseServices                       | see "Barber prices" below                               |
| Stars, RatingLine, ReviewCard, ReviewList          | value, size; google, shopName; review; reviews                                                 | see "Reviews" below                                     |
| ReviewsEditor (`src/admin/website`)                | enabled, google, items, staffNames, onSave                                                     | see "Reviews" below                                     |
| ReviewsPanel (`src/admin/website`)                 | none (loads the settings itself)                                                               | loading, error, then the ReviewsEditor states           |

## Motion

CSS, IntersectionObserver and the View Transitions API; no library (see DECISIONS D10). Only
transform and opacity move, plus clip-path on photo wipes and the stroke of the drawn check; colors
may change state; no layout property animates. `motion.css` is the only file with a `transition` or an
`animation`, and `tests/unit/motionCss.test.ts` checks it (durations from tokens, allowed properties,
no loops except the spinner).

| Where                   | What                                                                                                                 | Time                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Page change             | cross-fade with an 8px rise (View Transitions)                                                                       | 250ms                   |
| Home hero on load       | H1 lines rise (clipped, 60ms apart), then sub, buttons, info row rise 12px                                           | done by 610ms           |
| Scroll reveals          | chair cards, price rows, gallery tiles, Visit rise 16px, 60ms stagger; photos wipe up (clip-path)                    | 250ms, 400ms            |
| CTA band headline       | the same line rise, on scroll                                                                                        | 400ms                   |
| Buttons                 | press .97; hover sweeps a red fill left to right (primary, outline); spinner keeps width                             | 150ms, 250ms            |
| Cards and chips         | hover lift -2px with `--shadow-pop` (desktop); selected color; red underline grows 0 to 32px                         | 150ms                   |
| Sheets, modal, lightbox | sheet from the bottom (phone) or side (desktop); modal scales from .96; backdrop to 50% ink                          | open 250ms, close 150ms |
| Phone menu              | slides down, links stagger in, hamburger becomes an X                                                                | 250ms, 60ms stagger     |
| Booking                 | step bar segment fills red; step content slides the way you go; time chips pop; the ticket rises and its check draws | 250ms, 400ms            |
| Toasts                  | slide up above the bottom bar, leave after 4s (7s with an action), pause on hover or focus                           | 250ms                   |
| Admin                   | row color fades, new rows slide in, skeleton blocks (still)                                                          | 250ms                   |

Progressive by construction: content is visible by default. `src/lib/motion.ts` adds `motion-ready` to
`<html>` only when IntersectionObserver exists and the visitor allows motion. Only then do elements
below the fold start hidden (`useReveal` hides an element only if it starts below the viewport), and
anything already in view at load is never hidden. If scripts fail, nothing was hidden. Under
`prefers-reduced-motion: reduce` no motion rules apply at all and every transition is switched off.
Off limits: scroll jacking, parallax, pinned sections, cursor effects, looping decoration, timers.

## The phone bottom bar

`BottomBar`, below 1024px on every public page except `/admin`, `/setup`, `/kit` and `/portal`
(the barber portal lives at `/team`, which is in `NO_BAR_PREFIXES`).
Two equal halves, each 60px plus `env(safe-area-inset-bottom)` (the page declares
`viewport-fit=cover`), a 2px red rule on top. Default: CALL (ink, `tel:`) and BOOK NOW (white, `/book`).
Pages change it with `useBar`: BOOK LEE on a profile, BACK and CONTINUE (CONFIRM BOOKING on the
last step) in booking, with a thin summary row above. The bar publishes its height as `--bar-h`; the
page pads by it and toasts sit above it. It hides while a text field has focus or the visual viewport
has shrunk by more than 150px (the keyboard), and returns when they end.

## Rules for new UI

1. Build from the kit. Never fork a component; add a prop or a state. Prompt 11's dashboard and
   portal screens are assembled from these parts.
2. Keep the `exq-*` and `exq-adm-*` class names and `data-state` values.
3. Phone first at 390, then 768, then 1280.
4. Colors and sizes only from the tokens; durations only from the motion tokens.
5. Every action gives feedback: a Toast, an inline message or a state change.
6. Text on photos only over a solid chip or scrim; names and prices sit under photos.
7. Tap targets 44px or larger. Every image has alt text and dimensions.
8. No emoji, no em dashes, no purple, no gradient text, no bento grids, no glass, no fake numbers or
   reviews, no "scroll down" hints.

## Icons (prompt 11)

Icons come only from `@untitled-ui/icons-react` (deep imports). Rules: none on headings, at most one per
button, `aria-hidden` beside a text label, and an icon-only button has an `aria-label` plus the desktop
tooltip (`IconButton`). A label that names its item can pass a
shorter `tip` (the gallery rows: Move up, Move down, Remove), so the tooltip stays on screen. The one exception is `SocialIcon` (Instagram, TikTok, Facebook), because Untitled UI
has no brand glyphs; see D11-37. Where icons appear: the bottom bar (Call, Book now), hero and Visit facts,
the booking step bar ticks, the ticket rows (Chair, Day, Time, Services, For, Notes), toast tones, and the
owner dashboard buttons and tiles.

## The barber portal and the owner dashboard (prompt 11)

Both are built from the kit (`Sidebar`, `StatTile`, `DataTable`, `SearchBox`, `PinPad`, `BarChart`, `Tabs`,
`BottomTabs`, `IconButton`). Admin type is 13 to 22px; motion is calmer than the public site and lives only in
`motion.css`. `/team` is a phone first page with four tabs, 48px targets and 64px PIN keys, and uses
`--card-2` (not the light-only `--surface-2`). Toasts carry a tone icon. The demo notice is a `Modal` with a
focus trap and an inert page behind it.

## Barber prices (prompt 12)

Barbers charge different prices for the same service, so a service has the shop's price and time and each
person may override either (`staff.servicePrices`). One pure helper, `shared/lib/servicePricing.ts`, decides every
number; `src/lib/menuPrices.ts` is its client side use (the price list, a chair's menu, the booking steps).

Customer pages show it with the existing `PriceRow` and `OptionCard` meta, no new component: a plain price where
everyone who does the service charges the same and the shop does not say "from", `From $x` where they differ or
the shop flag says so, and the lowest price's own minutes beside it. A chair page shows only that person's prices.
In booking, a chosen chair shows its own total, first available shows the lowest total among the chairs that can be
assigned, and the barber step shows what the chosen services come to with each person.

**PriceOverrideEditor** (Team, Prices tab, owner only; also in `/kit`, section "Barber prices"). Built from `Input`,
`Button` and the dashboard panel classes (`exq-panelbody`, `exq-tabbody`); its own classes are `exq-priceedit*`
in `dashboard.css`, tokens only. One group per service on the barber's menu, with the shop price and time as a hint
and the same numbers as the placeholders. States, on `data-state` of the form: `idle` (nothing changed, Save is
disabled), `changed` (Save on), `invalid` (a field shows its error under it and Save is disabled), `saving` (Save
shows its loading state, every field is disabled), and `empty` (the barber has no services; it says so and offers
"Choose services"). A group is `data-state="custom"` (red border) when it holds an entry and `shop` when it is empty;
"Use shop price" appears only on a custom group. A refused save shows `ErrorNote` under the form and keeps what was
typed. A save shows a toast and writes the audit entry `staff.prices.update` with the list before and after.
Focus is the kit's input focus ring; every field is labelled "Price in dollars for X" and "Minutes for X" for screen
readers.

## Reviews (prompt 12)

Real reviews only, word for word from Google and theCut (`settings.reviews`, seeded from
`docs/content/exquisite-site-data.json`). The owner shows, hides and orders them; nobody types one. All four
pieces are in `/kit`, section "Reviews". Classes `exq-stars*`, `exq-ratingline*`, `exq-review*` (in `pages.css`)
and `exq-reviewsedit*`, `exq-reviewlist`, `exq-reviewrow*` (in `dashboard.css`), tokens only.

**Stars.** Five `Star01` icons from the icon set: outlines underneath, filled ones on top clipped to the value
(`--fill`, so 4.7 fills 94%). Red (`--accent-text`: #C8102E on paper, #FF5470 on ink). Sizes `md` (20px) and `sm`
(16px). States: `full`, `partial`. Always `aria-hidden`; the rating sits next to them in words.

**RatingLine.** The stars, "4.7 on Google from 15 reviews" (from the settings, never written in code; "1 review"
for one) and two quiet links, "Read them on Google" (the Maps link) and "Leave a review" (the write-a-review link),
both new tabs that say so to screen readers. States: `rated`; `unrated` (no rating or count yet: the links alone).
With neither a rating nor a place id it renders nothing.

**ReviewCard and ReviewList.** A `Card` list item holding a `figure`: the review's stars with "Rated 5 out of 5"
for screen readers, the quote in a `blockquote` at body size, then the name (bold) and the source with the month
and year in the 13px label size, for example "Google, November 2025". theCut gives no exact date, so the card says
"theCut" alone. States on the figure: `dated`, `undated`. ReviewList lays them out one per row on a phone and up to
three across where they fit (each at least 260px); `data-count` carries how many.

Where they show: Home, "What clients say", after "The work": the RatingLine, then the first three shown reviews.
A chair page, under the menu: up to three shown reviews about that chair, no rating line (the rating is the shop's).
Each section is left out when the section is off or no review is shown, so there is never an empty frame.

**ReviewsEditor** (Website, Reviews, owner only). Built from `Checkbox`, `Input`, `Button`, `IconButton`,
`EmptyState`, the status chips and the panel classes. Two parts:

- "On the site": the switch for the whole section, the Google rating, the number of reviews and the day it was
  checked, and a line that prints what the site will say. Form states: `idle` (Save disabled), `changed`,
  `invalid` (the field shows its error, Save disabled), `saving` (fields disabled, Save loading). A refused save
  shows `ErrorNote` and keeps what was typed.
- "Reviews": one row per review with the name, the source, the month, the chair it is about and the full quote,
  a "Hidden" chip on a hidden one and "On Home" on the three Home shows. The arrows move a review up or down and
  Show or Hide toggles it; each saves at once, the list is `data-busy` while it saves and every action is disabled.
  Row states: `shown`, `hidden` (muted text). List states: `on`, `off` (the section is off; a line says nothing
  shows), `empty` (no reviews; it explains they come with the shop data and cannot be typed in).

Every save shows a toast, and `PUT /api/admin/reviews` writes the audit entry `settings.reviews.update` with the
switch, the rating and each review's place and visibility, before and after.

**ReviewsPanel** is the Website, Reviews tab: it loads the settings and the team (for "about Drew"), hands them to
ReviewsEditor and saves each change through `PUT /api/admin/reviews` with the toast line the editor names. Its own
states are the kit's: `Status` "Loading the reviews" while it loads and an `ErrorState` ("The reviews did not
load") when the settings do not arrive; without the team it still works, with no "about" names. It is not on
`/kit` because it only fetches and saves; the editor it wraps is, in every state.

## Photos (prompt 12)

The shop's real photos (`seed/photos`, WebP, about 1600px on the long edge) and any the owner uploads follow
the same rules. Every rule here holds with any photo, so a new upload never breaks a layout.

- Every image has alt text (required on upload; the manifest's line for a seed photo) and its width and height,
  so nothing shifts while it loads (CLS 0). Frames have a fixed ratio (`PhotoFrame` 4:5, 1:1 or 16:9) and crop
  with `object-fit: cover`.
- The Home hero photo is the LCP image: eager, `fetchpriority="high"`, `sizes` for its slot, never inside a
  reveal. Below 1024px it fills the ink hero behind the text under `--scrim-photo`, cropped `85% 30%` (where the
  faces are); from 1024px it stands in its own 4:5 column. Without a photo the hero is text only.
- Everything below the fold is `loading="lazy"` with `sizes` for its grid (`PhotoGrid`). Gallery and work tiles
  crop square toward the upper middle (`50% 35%`), so heads and the cut stay in frame. These crops were checked on
  a contact sheet of all 15 seed photos.
- Home, "The work": the photos marked for Home first. Six show as two by three on a phone and three by two from
  768px; three to five show as one row of three; under three the section stays out (`src/lib/workPhotos.ts`),
  with a "See the gallery" link under it.
- Gallery: every gallery photo. The barber filter chips show only once a photo is credited to someone.
- A chair page's work strip: the photos credited to that chair. With none it shows up to three shop photos
  under the label "From the shop"; with no shop photos either, the strip is left out. Never an empty strip.
- A chair with no portrait (`photoUrl: null`, every chair today) shows the `PhotoFrame` placeholder: an ink panel
  with a faint stripe and the shears, never a blank box.
- No text sits on a photo except the hero over its scrim; names and prices sit under photos.
- Visit has no storefront photo yet, so it has no photo slot at all (no placeholder in its place).
- The old circular barber pole logo is never used, in any form.
