# Design direction V2: "Shop Sign"

Bold, editorial, black and white with red as the accent, like the lettering on a
barbershop window. It is the same brand, set louder. This file is the brief for
prompt 10; `docs/DESIGN-SYSTEM.md` is the living reference for what was built.

## Reference

Rob's phone mockups (`docs/brand/website/exq_site_mobile_board.png` when present;
the repository did not contain the board, so the written brief is the source):

- Header: a thin ink strip with the announcement in small caps, then white with
  the logo left, a hamburger right and a 2px ink rule underneath.
- Hero: a small red caps label, a huge heavy all-caps H1 on four lines (GIFTED
  HANDS. EXQUISITE CUTS., EXQUISITE in red), a gray sub line, two pill buttons
  (BOOK A CHAIR ink filled, SEE SERVICES ink outline), then an info row (OPEN
  TODAY, FIND US, WALK INS).
- Services: an ink section, label THE MENU, H2 SERVICES, a group label over a
  white rule, rows with name and one line description left, a dotted leader and
  a large bold price.
- The Crew: label THE CREW, H2 PICK YOUR CHAIR, a big 4:5 portrait with a CHAIR
  label and the name in heavy caps below it.
- Booking: a four part progress bar (1 SERVICE, 2 BARBER, 3 TIME, 4 DETAILS;
  done red, current ink, later gray), numbered section heads in ink circles,
  option cards white with a light border that turn ink with a short red
  underline when selected.
- Phone bottom bar: CALL (ink) and BOOK NOW (white), 60px tall, 2px red rule on
  top.

Signature move kept from earlier prompts: "Today's chairs" (who is in and the
next open time) on Home and The Chairs.

## Tokens

One file, `src/styles/tokens.css`. Everything else reads from it.

| Group  | Tokens                                                                                                                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color  | `--ink` #111, `--ink-2` #1F1F1F, `--ink-3` #333, `--text-2` #4A4A4A, `--text-3` #6B6B6B, `--line` #D9D9D9, `--surface-2` #F4F4F4, `--paper` #FFF, `--red` #C8102E, `--red-600` #A80D27, `--red-on-dark` #FF5470, `--red-50` #FDF2F4, `--ok`, `--warn`, `--info` |
| Type   | `--font` Jost Variable; `--t-label` 13, `--t-body` 17 (18), `--t-h3` 22 (26), `--t-h2` 36 (56), `--t-display` 52 (96), `--t-price` 22; desktop values from 1024px                                                                                               |
| Space  | `--s1` 4 to `--s9` 96                                                                                                                                                                                                                                           |
| Shape  | `--r-card` 4 for cards, inputs and photos; `--r-pill` for buttons and chips; the bottom bar is square                                                                                                                                                           |
| Motion | `--ease-out`, `--ease-in`, `--d-fast` 150ms, `--d-base` 250ms, `--d-slow` 400ms, `--stagger` 60ms                                                                                                                                                               |

Weights: label 600 caps +14% tracking, body 400, h3 700, h2 800 caps, display 900
caps, price 700 tabular. Public pages use only the six sizes; the admin uses 13 to
22px.

## Page plan

| Page       | Order                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Home       | Hero text, hero photo (only if uploaded), Today's chairs, The Menu (ink), The Work (hidden when empty), Visit, CTA band, footer |
| Services   | Ink page: label, H1, group chips with counts, rows linking to `/book?service=id`                                                |
| The Chairs | PICK YOUR CHAIR: ChairCards with CHAIR number, name, specialty, next open or Off today                                          |
| Profile    | Portrait, name, specialty, next 3 openings, services with prices, a strip of their work, Instagram                              |
| Gallery    | 2 columns on phones, 3 on desktop, filter chips by barber, lightbox with the barber and Book                                    |
| Visit      | Hours with today highlighted, address, Directions, Call, walk in and cancellation policy                                        |
| Book       | StepBar, numbered section heads, OptionCards, day strip with counts, times grouped by part of day, Ticket confirmation          |
| Manage     | Ticket with Reschedule and Cancel; Cancel confirms in a Sheet                                                                   |

Frame: TopStrip (announcement from shop settings), Header, MobileMenu (full
screen ink sheet), BottomBar (phones only), Footer (no build stamp, no staff link).

## Motion

CSS, IntersectionObserver and View Transitions. No library. Only transform and
opacity move (plus clip-path on photo reveals and the stroke of the confirmation
check). Reveals are progressive: content is visible by default, `motion-ready` on
`<html>` is added by script only when IntersectionObserver exists and the visitor
allows motion, and anything already in view at load is never hidden. Under
`prefers-reduced-motion: reduce` there are no transforms or reveals, only instant
state changes. No scroll jacking, parallax, pinned sections, cursor effects,
looping decoration or timers.

## Not in this direction

Purple, gradient text, bento grids, glass, fake stats or reviews, emoji, "scroll
down" hints, text on photos without a scrim, names or prices on photos.
