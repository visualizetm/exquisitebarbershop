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
themes.

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
| ChairCard, ChairCardSkeleton                       | name, specialty, chairNumber, photo, status, statusLabel, to, selected                         | next-open, in, off, closed, none, selected, loading     |
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
(prompt 11's barber portal must live under `/portal`, or add its prefix to `NO_BAR_PREFIXES`).
Two equal halves, each 60px plus `env(safe-area-inset-bottom)` (the page declares
`viewport-fit=cover`), a 2px red rule on top. Default: CALL (ink, `tel:`) and BOOK NOW (white, `/book`).
Pages change it with `useBar`: BOOK MARCUS on a profile, BACK and CONTINUE (CONFIRM BOOKING on the
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
