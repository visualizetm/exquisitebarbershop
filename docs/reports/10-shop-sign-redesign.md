REPORT 10: SHOP SIGN REDESIGN, MOTION, PHONE BAR AND CLOUDINARY
Branch claude/p10-shop-sign-redesign from main (17fa43d, PR 4 merged). Commits and PR: see the pull request.
Milestones: 1 tokens, variable Jost, kit and /kit; 2 frame (strip, header, phone menu, bottom bar, footer); 3 public pages, reveals, page transitions; 4 Book, Manage, overlays, admin restyle; 5 Cloudinary; 6 QA.
Checks: Lighthouse mobile (brotli, like Vercel) Home 95, Services 96, Book 97 performance, accessibility 100, CLS 0. Axe clean on every public page and booking step, light and dark, 390 and 1280. Vitest 382 passed; Playwright 51 dev, 7 launch, 6 showcase; test:vercel-function 89.
Not verified here: a real iPhone (bottom bar with the keyboard and the home bar, the feel of the motion), Cloudinary itself (tests use a fake that checks the same signatures), Vercel preview.
Bug found and fixed: the phone bar hover rule turned CONFIRM BOOKING ink on red after a tap.
