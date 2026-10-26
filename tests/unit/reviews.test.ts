import { describe, expect, it } from 'vitest';
import { reviewsRequestSchema } from '../../shared/api/admin';
import {
  chairReviews,
  googleRatingText,
  ratingLabel,
  reviewMonth,
  reviewSourceLabel,
  shownReviews,
} from '../../shared/lib/reviews';
import {
  MAX_REVIEWS,
  REVIEW_TEXT_MAX,
  reviewItemSchema,
  reviewsSettingsSchema,
  shopSettingsUpdateSchema,
  type ReviewItem,
} from '../../shared/schemas/shopSettings';

const id = (n: number) => n.toString(16).padStart(24, '0');

function review(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: id(1),
    name: 'Unique D.',
    text: 'Great environment.',
    stars: 5,
    source: 'google',
    date: '2025-11-25',
    staffId: null,
    show: true,
    sortOrder: 0,
    ...overrides,
  };
}

describe('the review schema', () => {
  it('accepts a real review, with or without a date and a chair', () => {
    expect(reviewItemSchema.safeParse(review()).success).toBe(true);
    const { date: _date, ...undated } = review({ source: 'thecut', staffId: id(9) });
    expect(reviewItemSchema.safeParse(undated).success).toBe(true);
  });

  it('takes stars as a whole number from 1 to 5', () => {
    for (const stars of [1, 3, 5]) {
      expect(reviewItemSchema.safeParse(review({ stars })).success, String(stars)).toBe(true);
    }
    for (const stars of [0, 6, 4.5, -1]) {
      expect(reviewItemSchema.safeParse(review({ stars })).success, String(stars)).toBe(false);
    }
  });

  it('knows only Google and theCut as sources', () => {
    expect(reviewItemSchema.safeParse(review({ source: 'thecut' })).success).toBe(true);
    expect(reviewItemSchema.safeParse({ ...review(), source: 'yelp' }).success).toBe(false);
    expect(reviewSourceLabel('google')).toBe('Google');
    expect(reviewSourceLabel('thecut')).toBe('theCut');
  });

  it('keeps the text between 1 and 600 characters', () => {
    expect(REVIEW_TEXT_MAX).toBe(600);
    expect(reviewItemSchema.safeParse(review({ text: 'x'.repeat(600) })).success).toBe(true);
    expect(reviewItemSchema.safeParse(review({ text: 'x'.repeat(601) })).success).toBe(false);
    expect(reviewItemSchema.safeParse(review({ text: '' })).success).toBe(false);
    expect(reviewItemSchema.safeParse(review({ text: '   ' })).success).toBe(false);
    expect(reviewItemSchema.safeParse(review({ name: '' })).success).toBe(false);
  });

  it('takes the date only as YYYY-MM-DD, a real day', () => {
    for (const date of ['11/25/2025', '2025-11-31', '2025-13-01', '25-11-2025', 'yesterday', '']) {
      expect(reviewItemSchema.safeParse(review({ date })).success, date).toBe(false);
    }
    expect(reviewItemSchema.safeParse(review({ date: '2024-02-29' })).success).toBe(true);
  });

  it('needs 24 hex character ids and a whole sort order', () => {
    expect(reviewItemSchema.safeParse(review({ id: 'not-an-id' })).success).toBe(false);
    expect(reviewItemSchema.safeParse(review({ staffId: 'drew' })).success).toBe(false);
    expect(reviewItemSchema.safeParse(review({ sortOrder: 1.5 })).success).toBe(false);
    expect(reviewItemSchema.safeParse(review({ sortOrder: -10 })).success).toBe(false);
  });

  it('holds at most 30 reviews, each with its own id', () => {
    expect(MAX_REVIEWS).toBe(30);
    const many = (n: number) =>
      Array.from({ length: n }, (_v, i) => review({ id: id(i + 1), sortOrder: i }));
    expect(reviewsSettingsSchema.safeParse({ enabled: true, items: many(30) }).success).toBe(true);
    expect(reviewsSettingsSchema.safeParse({ enabled: true, items: many(31) }).success).toBe(false);
    expect(
      reviewsSettingsSchema.safeParse({ enabled: true, items: [review(), review()] }).success,
    ).toBe(false);
    expect(reviewsSettingsSchema.safeParse({ enabled: true, items: [] }).success).toBe(true);
  });
});

describe('the reviews request', () => {
  const items = [
    { id: id(1), show: true },
    { id: id(2), show: false },
  ];

  it('takes the switch, the rating or the list, each on its own', () => {
    expect(reviewsRequestSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(reviewsRequestSchema.safeParse({ items }).success).toBe(true);
    expect(
      reviewsRequestSchema.safeParse({
        google: { rating: 4.7, reviewCount: 15, ratingCheckedOn: '2026-10-25' },
      }).success,
    ).toBe(true);
    expect(reviewsRequestSchema.safeParse({}).success).toBe(false);
  });

  it('carries no text, name or stars and adds nothing: unknown fields are refused', () => {
    const withText = [{ ...items[0], text: 'Best shop ever' }];
    expect(reviewsRequestSchema.safeParse({ items: withText }).success).toBe(false);
    expect(reviewsRequestSchema.safeParse({ items: [{ ...items[0], stars: 1 }] }).success).toBe(
      false,
    );
    expect(
      reviewsRequestSchema.safeParse({ items, add: { name: 'Fake F.', text: 'x' } }).success,
    ).toBe(false);
  });

  it('refuses a review listed twice, more than 30, and a bad rating', () => {
    expect(reviewsRequestSchema.safeParse({ items: [items[0], items[0]] }).success).toBe(false);
    const many = Array.from({ length: 31 }, (_v, i) => ({ id: id(i + 1), show: true }));
    expect(reviewsRequestSchema.safeParse({ items: many }).success).toBe(false);
    for (const google of [
      { rating: 6, reviewCount: 15, ratingCheckedOn: '' },
      { rating: 4.75, reviewCount: 15, ratingCheckedOn: '' },
      { rating: 0, reviewCount: 15, ratingCheckedOn: '' },
      { rating: 4.7, reviewCount: 1.5, ratingCheckedOn: '' },
      { rating: 4.7, reviewCount: 15, ratingCheckedOn: '10/25/2026' },
      { placeId: 'x', rating: 4.7, reviewCount: 15, ratingCheckedOn: '' },
    ]) {
      expect(reviewsRequestSchema.safeParse({ google }).success, JSON.stringify(google)).toBe(
        false,
      );
    }
    expect(
      reviewsRequestSchema.safeParse({ google: { rating: 0, reviewCount: 0, ratingCheckedOn: '' } })
        .success,
    ).toBe(true);
  });

  it('is not part of the general settings save, which strips any reviews it is sent', () => {
    expect(Object.keys(shopSettingsUpdateSchema.shape)).not.toContain('reviews');
  });
});

describe('which reviews the site shows', () => {
  const list = [
    review({ id: id(1), name: 'C', sortOrder: 20, staffId: id(7) }),
    review({ id: id(2), name: 'A', sortOrder: 0 }),
    review({ id: id(3), name: 'Hidden', sortOrder: 5, show: false, staffId: id(7) }),
    review({ id: id(4), name: 'B', sortOrder: 10, staffId: id(7) }),
    review({ id: id(5), name: 'D', sortOrder: 30, staffId: id(7) }),
    review({ id: id(6), name: 'E', sortOrder: 40, staffId: id(7) }),
  ];

  it('only the shown ones, in sort order, and none while the section is off', () => {
    expect(shownReviews({ enabled: true, items: list }).map((r) => r.name)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
    expect(shownReviews({ enabled: false, items: list })).toEqual([]);
    expect(shownReviews({ enabled: true, items: [] })).toEqual([]);
  });

  it('a chair page gets at most three about that chair', () => {
    const shown = shownReviews({ enabled: true, items: list });
    expect(chairReviews(shown, id(7)).map((r) => r.name)).toEqual(['B', 'C', 'D']);
    expect(chairReviews(shown, id(8))).toEqual([]);
  });
});

describe('the words around a review', () => {
  it('prints the month and year of a date, and nothing without one', () => {
    expect(reviewMonth('2025-11-25')).toBe('November 2025');
    expect(reviewMonth('2024-09-24')).toBe('September 2024');
    expect(reviewMonth(null)).toBeNull();
    expect(reviewMonth(undefined)).toBeNull();
  });

  it('builds the Google line from the settings, and none while no rating is set', () => {
    expect(googleRatingText({ rating: 4.7, reviewCount: 15 })).toBe(
      '4.7 on Google from 15 reviews',
    );
    expect(googleRatingText({ rating: 5, reviewCount: 1 })).toBe('5.0 on Google from 1 review');
    expect(googleRatingText({ rating: 0, reviewCount: 0 })).toBeNull();
    expect(googleRatingText({ rating: 4.7, reviewCount: 0 })).toBeNull();
    expect(ratingLabel(4)).toBe('4.0');
  });
});
