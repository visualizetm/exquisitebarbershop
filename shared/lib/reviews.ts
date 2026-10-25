import { DateTime } from 'luxon';
import type { GoogleRating, ReviewItem, ReviewSource } from '../schemas/shopSettings';
import { SHOP_TIMEZONE } from './constants';

/** How many reviews Home shows, and how many a chair page shows. */
export const HOME_REVIEWS = 3;
export const CHAIR_REVIEWS = 3;

/**
 * The reviews the public site may show, in the owner's order: none while the section is off,
 * otherwise only the ones marked to show. The public API serves exactly this list.
 */
export function shownReviews<T extends Pick<ReviewItem, 'show' | 'sortOrder'>>(reviews: {
  enabled: boolean;
  items: readonly T[];
}): T[] {
  if (!reviews.enabled) return [];
  return reviews.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.show)
    .sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.index - b.index)
    .map(({ item }) => item);
}

/** The first few shown reviews about one chair, for that chair's page. */
export function chairReviews<T extends { staffId: string | null }>(
  shown: readonly T[],
  staffId: string,
  max = CHAIR_REVIEWS,
): T[] {
  return shown.filter((r) => r.staffId === staffId).slice(0, max);
}

const SOURCE_LABELS: Record<ReviewSource, string> = { google: 'Google', thecut: 'theCut' };

export function reviewSourceLabel(source: ReviewSource): string {
  return SOURCE_LABELS[source];
}

/** "November 2025" for a review date, or null when the review has none (theCut). */
export function reviewMonth(date: string | null | undefined): string | null {
  if (!date) return null;
  const day = DateTime.fromISO(date, { zone: SHOP_TIMEZONE });
  return day.isValid ? day.setLocale('en-US').toFormat('LLLL yyyy') : null;
}

/** "4.7", always one decimal, as Google prints it. */
export function ratingLabel(rating: number): string {
  return rating.toFixed(1);
}

/**
 * "4.7 on Google from 15 reviews", from the settings the owner keeps up to date, or null while no
 * rating is set (the line is left out then, never filled with a made up number).
 */
export function googleRatingText(
  google: Pick<GoogleRating, 'rating' | 'reviewCount'>,
): string | null {
  if (google.reviewCount < 1 || google.rating < 1) return null;
  const count = google.reviewCount === 1 ? '1 review' : `${String(google.reviewCount)} reviews`;
  return `${ratingLabel(google.rating)} on Google from ${count}`;
}
