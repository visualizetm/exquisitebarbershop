import type { HeroCopy } from '../schemas/shopSettings';

export interface HeroLine {
  text: string;
  accent: boolean;
}

/**
 * The headline as display lines: one word per line up to four words (the way "Gifted hands.
 * Exquisite cuts." reads), else the words paired up so the hero never grows past four lines.
 * The line holding the red word is the accent line.
 */
export function heroLines(hero: Pick<HeroCopy, 'headline' | 'redWord'>): HeroLine[] {
  const words = hero.headline.trim().split(/\s+/).filter(Boolean);
  const isRed = (w: string) => w.replace(/[.,!?]+$/, '') === hero.redWord;
  if (words.length <= 4) return words.map((w) => ({ text: w, accent: isRed(w) }));
  const per = Math.ceil(words.length / 4);
  const lines: HeroLine[] = [];
  for (let i = 0; i < words.length; i += per) {
    const chunk = words.slice(i, i + per);
    lines.push({ text: chunk.join(' '), accent: chunk.some(isRed) });
  }
  return lines;
}
