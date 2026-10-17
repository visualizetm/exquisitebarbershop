# Decisions

One line per call made during a run, newest at the bottom. Each entry says what
was decided, what was rejected, and why. The rules behind them: pick the option
with less code that is easier to verify; outside the brief, pick the plainer
option; drop any effect that costs speed or clarity; the brief wins for new UI,
existing patterns win for shared logic, and the "Must not change" lists always
win.

## Prompt 4: design pass, photos, public pages

- D4-01 Brand SVGs. The brief says they are in `public/brand/`, but no branch has
  them. Placeholder marks were generated with the exact file names the brief
  lists (primary, wordmark, stacked, q-icon, seal, pole, each -black and -white)
  so every reference is wired. They are geometric plus SVG text, so as `<img>`
  the text falls back to the system font. Drop the real files in with the same
  names; nothing else changes.
- D4-02 Fonts. `@fontsource/jost` 5.3, latin subset only, weights 400, 500 and
  700 (three woff2 files, 30 KB). Self-hosted, so the CSP keeps `font-src 'self'`.
- D4-03 Semantic surfaces. The token file holds exactly the variables the brief
  lists. The light and dark surfaces (`--bg`, `--card`, `--border`, `--fg`,
  `--accent-text` and so on) live in `base.css`, derived from the tokens, so
  dark mode is a swap of six variables under `.exq-dark` and the admin media
  query instead of a second stylesheet.
- D4-04 Sheet. Built on the native `<dialog>` with `showModal()`: focus trap,
  Escape, inert background and focus return come from the browser. Rejected a
  hand-rolled focus trap (more code, same result).
- D4-05 Kit CSS. One file, `src/styles/kit.css`, with an `exq-*` prefix per
  component and state on `data-state`. Rejected CSS modules and per-component
  files: one file is easier to audit against the token list.
- D4-06 Existing class names. Prompt 1 and 2 class names and data-state values
  are kept. The old `.exq-button` picks up the kit look through base.css so
  pages not yet restyled are not broken in the meantime.
- D4-07 Kit page. `/kit` exists only in development builds (`import.meta.env.DEV`),
  as one lazy route, so every component state can be screenshotted and checked
  without a storybook dependency. It is not in the production bundle.
- D4-08 Screenshots. `scripts/screens.ts` drives the e2e server with Playwright
  and builds the montage with the ImageMagick `montage` binary already on the
  machine. Rejected a Node image library (another dependency for one job).
- D4-09 Nav. Solid paper bar, sticky, never transparent over photos, so the
  "readable over photos" rule holds without a scrim or scroll effect.
