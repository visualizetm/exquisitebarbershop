# Design system

The source of truth for how the site and the dashboard look. Tokens live in
`src/styles/tokens.css`; semantic surfaces and global type in `src/styles/base.css`;
the kit in `src/styles/kit.css` and `src/components/ui/`. Every component is seen
in every state on `/kit` (development builds only).

## Tokens

| Group   | Tokens                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ink     | `--ink` #111111, `--ink-2` #1F1F1F, `--ink-3` #333333, `--text-2` #4A4A4A, `--text-3` #6B6B6B, `--line` #D9D9D9, `--surface-2` #F4F4F4, `--paper` #FFFFFF           |
| Red     | `--red-50` to `--red-900` (#FDF2F4, #FBE0E5, #F5B8C3, #EC8698, #E04C66, #C8102E, #A80D27, #870A1F, #650818, #440510), `--red-on-dark` #FF5470                       |
| Meaning | `--ok` #1E7A46, `--warn` #9A6700, `--info` #1F5FAD, `--danger` = `--red-600`                                                                                        |
| Type    | `--font` Jost, `--fs-1` 14, `--fs-2` 16, `--fs-3` 18 (20), `--fs-4` 24 (28), `--fs-5` 34 (44), `--fs-6` 48 (72) at 1024px and up; `--lh-tight` 1.1, `--lh-body` 1.5 |
| Space   | `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32, `--s7` 48, `--s8` 64, `--s9` 96                                                                     |
| Shape   | `--r-sm` 8, `--r-md` 16, `--r-pill` 999; the arch frame is `999px 999px 16px 16px`                                                                                  |
| Shadow  | `--shadow-1` soft card, `--shadow-2` sheets and toasts                                                                                                              |

Semantic surfaces (tokens.css) derive from the tokens: `--bg`, `--card`,
`--card-2`, `--border`, `--fg`, `--fg-2`, `--fg-3`, `--accent`,
`--accent-strong`, `--accent-text`, `--accent-soft`, `--selected-bg`,
`--selected-fg`, `--band-border`, `--card-shadow`. Light by default. `.exq-dark`
switches a block to ink inside a light page (bg #111, cards #1F1F1F with no
shadow, borders #333, red text #FF5470).

## Themes

Three modes everywhere, public site and admin: System (default, follows
`prefers-color-scheme`), Light and Dark. The choice is stored in localStorage
under `exq-theme` and applied as `data-theme="light|dark"` on `<html>`; with no
attribute, System applies. An inline script in `index.html` sets the attribute
and the `theme-color` meta before the first paint; its sha256 is listed in the
CSP (`vercel.json`), checked by `tests/unit/csp.test.ts`. `theme-color` is
#FFFFFF in light and #111111 in dark, kept live by `src/lib/theme.ts`.

Dark values (same list under `[data-theme="dark"]` and under
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`;
values change, names never):

| Token                  | Dark             | Notes                                                |
| ---------------------- | ---------------- | ---------------------------------------------------- |
| `--bg`                 | #111111          | page                                                 |
| `--card`               | #1A1A1A          | cards, sheets, the nav                               |
| `--card-2`             | #222222          | nested surfaces, hover                               |
| `--border`             | #2E2E2E          | lines, 3:1 against the page                          |
| `--fg`                 | #F4F4F4          | text                                                 |
| `--fg-2`               | #B8B8B8          | secondary text                                       |
| `--fg-3`               | #8C8C8C          | tertiary text, 5.6:1 on #111                         |
| `--accent`             | #C8102E          | red buttons keep white text                          |
| `--accent-text`        | #FF5470          | red text and live dots                               |
| `--selected-bg`        | #FFFFFF          | selected chips, days, segments invert to paper       |
| `--selected-fg`        | #111111          |                                                      |
| `--cta-bg`, `--cta-fg` | #C8102E, #FFFFFF | the emphasis button; paper on ink inside light bands |
| `--band-border`        | #2E2E2E          | top border of ink bands (the CTA band, the footer)   |
| `--ok` etc             | lighter          | #5CC98A, #E3B341, #7FB2FF, danger #FF5470            |
| `--card-shadow`        | none             | cards are lighter than the page instead              |

Inside `.exq-dark` bands the dark theme uses bg #1A1A1A and border #2E2E2E so
they still read as bands. Photos and scrims never change. Brand marks swap with
CSS: the `Mark` component renders the black and white files and
`.exq-mark--light` or `.exq-mark--dark` hides the other one. Switching is
instant; `html[data-theme-switching]` fades background, color and border for
150ms and not at all under reduced motion. Nothing moves on a switch.

Toggle: `ThemeMenu` (icon button with sun, moon and monitor; `aria-label`
"Theme: System"; a menu of `menuitemradio` items with arrow keys, Enter, Space
and Escape) in the public Nav, and `ThemeSwitch` (a `.exq-seg` radiogroup) in
the mobile menu Sheet and on the admin Account page. Axe (wcag2a and wcag2aa)
passes in both themes on Home, Book, admin Today and Account
(`tests/e2e/theme.spec.ts`).

## Type

- Jost only, self-hosted, weights 400, 500 and 700.
- Headings: 700, uppercase, letter-spacing -0.01em, line height 1.1. h1 `--fs-6`,
  h2 `--fs-5`, h3 `--fs-4`, h4 `--fs-3`.
- Section labels (`.exq-label`): 500, uppercase, letter-spacing .16em, 14px.
  Never above the hero H1.
- Body: 16px or larger at line height 1.5. 14px is for labels, captions and
  admin density only.
- Prices and times: `.exq-price` or `.exq-num` for tabular numerals.
- Marketing pages use at most the six sizes. Admin uses 14 to 24px.

## Shape, color and motion

- Pill buttons and chips; 16px cards, inputs, sheets and tickets; the arch for
  photos. No other radii.
- Colors only from the tokens. Red is for actions and live states (next open,
  selected time). Semantic colors only carry meaning (ok, warn, danger, info).
- Text contrast 4.5:1: `--text-3` on paper is 5.7:1, `--red-500` on paper 6.0:1,
  `--red-on-dark` on ink 6.5:1, `--line` on ink 13:1.
- Hover brightens (`filter: brightness`), never fades, bounces or moves layout.
  Nothing essential is hover only.
- Transitions only on state changes, 150 to 180ms, and off under
  `prefers-reduced-motion`. No reveals, parallax, scroll or cursor effects.
- Text on photos only over a scrim; names and prices sit under photos.
- Tap targets 44px or larger, including the small button size (44px tall,
  slim padding) and inline text links in the footer and the "more" lines.
  Every image has alt text and dimensions.

## Brand assets

- `public/brand/` holds the real marks (black and white of each, plus the pill).
- `public/og.png` (1200x630, white primary logo on ink), `favicon.ico`,
  `favicon.svg`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` and
  `apple-touch-icon.png` are rendered from the marks by
  `npx tsx scripts/brand-assets.ts`; rerun it when the marks change.
- `site.webmanifest` uses ink (#111111) for theme and background.

## Kit

| Component                        | Props                                                                               | States (data-state)                                 | Used by                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Button, ButtonLink, ButtonAnchor | variant primary, secondary, inverse; size sm, md, lg; block; icon; loading; pressed | default, hover (CSS), pressed, disabled, loading    | everywhere                                                          |
| Input, Select, Textarea          | label, hint, error, warning, plus native attributes                                 | default, error, warning (focus via CSS)             | Book, Manage, admin forms                                           |
| Chip, ChipLink, Chips            | selected, count, sub, tone ink or accent; Chips scroll                              | default, selected, disabled                         | filters, days, groups                                               |
| Card                             | pad none, md, lg; interactive; as                                                   | static, interactive                                 | admin Today, settings lists                                         |
| Sheet                            | open, title, size md or lg, onClose                                                 | open, closed                                        | Nav menu, Lightbox, confirms, admin forms                           |
| Toast (ToastProvider, useToast)  | text, tone, action, duration                                                        | tone neutral, ok, warn, danger                      | every action                                                        |
| EmptyState, ErrorState           | title, children, action                                                             | empty, error                                        | lists, loads                                                        |
| Nav                              | none (reads the route)                                                              | open, closed                                        | public layout                                                       |
| Footer                           | shop                                                                                | loading, ready                                      | public layout                                                       |
| StepBar                          | steps, current, onJump                                                              | per step: done, current, todo                       | Book                                                                |
| StickyCTA                        | primary, secondary, desktop hide or show                                            | shown, hidden (while typing)                        | Book, profile                                                       |
| PhotoArch                        | photo, name, tone, sizes, priority                                                  | loading, loaded, placeholder                        | ChairCard, profile                                                  |
| ChairCard, ChairCardSkeleton     | name, specialty, chairNumber, photo, status, statusLabel, to, selected, onSelect    | next-open, in, off, closed, none, selected, loading | Home strip, Chairs, Book                                            |
| TimeChip, TimeChipLink           | label, sub, selected, disabled, startAt, onClick or to                              | default, selected, disabled                         | Book, profile openings                                              |
| Ticket                           | code, heading, rows, total, actions, state                                          | confirmed, cancelled, completed                     | Book done, Manage                                                   |
| Lightbox                         | photos, index, onClose, onIndex                                                     | open (via Sheet)                                    | Home work, Gallery, profile                                         |
| ThemeMenu, ThemeSwitch           | none (read the stored choice); ThemeSwitch label                                    | open, closed; per item selected, idle               | Nav, mobile menu, admin Account                                     |
| Mark                             | name (primary, wordmark, stacked, q-icon, seal, pole, pill), alt, width, height     | light or dark file shown by CSS                     | Nav (wordmark from 1024px, stacked below), admin side nav (stacked) |

Layout helpers: `.exq-wrap` (1200px, 16px gutters, 32px from 768px),
`.exq-section`, `.exq-grid[data-cols][data-md][data-lg]`, `.exq-strip` (sideways
on phones, grid from 768px), `.exq-band` with `.exq-dark` for ink bands,
`.exq-seg` segmented control.

## Rules for new UI

1. Build from the kit. Never fork a component; add a prop or a state instead.
2. Keep the existing `exq-*` and `exq-adm-*` class names and data-state values;
   style through them or wrap them.
3. Phone first at 390, then 768, then 1280.
4. Every action gives feedback: a Toast or an inline message.
5. Choices are visible as chips with counts. Sheets, not page takeovers.
6. No emoji, no em dashes, no purple, no gradients except the hero scrim, no
   bento grids, no glass, no fake numbers or reviews.
