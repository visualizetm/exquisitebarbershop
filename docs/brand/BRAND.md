# Exquisite brand guide

Exquisite Barber & Beauty Lounge, 3309 Edgmont Ave, Brookhaven PA. Tagline: Gifted Hands.
Black, white and red. Site and app type: Archivo; the logo keeps its own lettering. The signature is the shears Q: the tail of the Q is a pair of closed shears with a red pivot dot.

## Logo files (`public/brand/`)

Every mark has a `-black` file for light backgrounds and a `-white` file for dark ones. The site swaps them with the theme through `Mark.tsx`.

| File                    | What it is                                                | Use it for                                      |
| ----------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| `exq-primary-*`         | W1 main logo: EXQUISITE over BARBER & BEAUTY LOUNGE       | Hero bands, print, anywhere the full name fits  |
| `exq-wordmark-*`        | W6 EXQUISITE alone                                        | Desktop header, small spaces                    |
| `exq-arched-*`          | W2 BARBER & BEAUTY arched over, GIFTED HANDS beneath      | Window, signage, big statement moments          |
| `exq-stacked-*`         | L2 disc emblem beside the main logo                       | Mobile header, admin and login screens          |
| `exq-lockup-vertical-*` | L3 crest above the main logo                              | Loading screen, about section, posters          |
| `exq-crest-*`           | E1 Crest Seal emblem                                      | Footer, stickers, window, anything 110px and up |
| `exq-seal-*`            | Same art as the crest (legacy name the footer still uses) | Same as crest                                   |
| `exq-disc-*`            | E4 Monogram Disc emblem                                   | Avatars, icons, anything under 110px            |
| `exq-q-icon-*`          | The shears Q alone                                        | Loaders, bullets, the empty state for photos    |

More color versions (red crest and disc, one-color crest and disc) are in `docs/brand/svg/`. PNG exports at 2000px are in `docs/brand/png/`. The boards are in `docs/brand/boards/`.

## Icons (`public/`)

`favicon.ico`, `favicon.svg`, `icon-32.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png` and `og.png` all use the Monogram Disc. The file names did not change, so `index.html` and `site.webmanifest` need no edits.

## Rules

- The logo weight is Jost 800. Never redraw the logo in live text. Always use the files.
- The red pivot dot stays red on every full-color version.
- Clear space around any mark is at least the height of the Q.
- Minimum sizes: the crest at 110px wide, the primary logo at 160px wide, the disc at 16px.
- Never stretch, rotate, outline, add shadows to or recolor the marks outside the provided versions.
- One red emblem per piece at most.

## Color

| Token           | Hex       | Use                                     |
| --------------- | --------- | --------------------------------------- |
| `--ink`         | `#111111` | Text, ink sections, logo on light       |
| `--paper`       | `#FFFFFF` | Backgrounds, logo on dark               |
| `--red`         | `#C8102E` | Actions, accents, the pivot dot, labels |
| `--red-on-dark` | `#FF5470` | Red text on ink (passes contrast)       |
| `--line`        | `#D9D9D9` | Borders and rules                       |
| `--text-2`      | `#4A4A4A` | Secondary text on white                 |

## Type

Site and app type: Archivo (`@fontsource-variable/archivo`, weight and width axes). The logo keeps its own lettering: its files are fixed paths drawn in Jost 800 and never redrawn in live text.

- Headlines: 800 to 900, all caps, tight line height, slight negative tracking.
- Labels: 600, all caps, wide tracking, red.
- Body: 400 at 17 to 18px.
- Prices: 700 with tabular numbers.
